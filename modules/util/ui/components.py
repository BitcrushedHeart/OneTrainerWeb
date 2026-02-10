import contextlib
import tkinter as tk
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from tkinter import filedialog
from typing import Any, Literal

from modules.util.enum.PathIOType import PathIOType
from modules.util.enum.TimeUnit import TimeUnit
from modules.util.enum.TrainingMethod import TrainingMethod
from modules.util.path_util import supported_image_extensions
from modules.util.ui.ToolTip import ToolTip
from modules.util.ui.ui_utils import DebounceTimer, register_drop_target
from modules.util.ui.UIState import UIState
from modules.util.ui.validation import DEFAULT_MAX_UNDO, FieldValidator, PathValidator

import customtkinter as ctk
from customtkinter.windows.widgets.scaling import CTkScalingBaseClass
from PIL import Image

PAD = 10

# Common filetypes for dialogs
MODEL_FILETYPES = [
    ("All Files", "*.*"),
    ("Diffusers", "model_index.json"),
    ("Checkpoint", "*.ckpt *.pt *.bin"),
    ("Safetensors", "*.safetensors"),
]


def _safe_bool(var, default=True):
    try:
        return bool(var.get())
    except Exception:
        return default


def _wrap_dropdown_destroy(component):
    # temporary fix until https://github.com/TomSchimansky/CustomTkinter/pull/2246 is merged
    orig_destroy = component._dropdown_menu.destroy
    component._dropdown_menu.destroy = lambda: (orig_destroy(), CTkScalingBaseClass.destroy(component._dropdown_menu))


@dataclass(frozen=True)
class ComponentValidationSettings:
    debounce_stop_typing_ms: int = 1700
    debounced_invalid_revert_ms: int = 1000
    focusout_invalid_revert_ms: int = 1200


COMPONENT_VALIDATION_SETTINGS = ComponentValidationSettings()

@dataclass
class ValidationState:
    status: Literal['error', 'warning'] | None = None
    message: str = ""

    def clear(self):
        self.status, self.message = None, ""

    def set_status(self, status: Literal['error', 'warning'], message: str):
        self.status, self.message = status, message


class EntryValidationHandler:

    def __init__(
        self,
        component: ctk.CTkEntry,
        var: tk.Variable,
        var_name: str,
        ui_state: UIState,
        custom_validator: Callable[[str], ValidationResult] | None = None,
        validation_state: ValidationState | None = None,
    ):
        self.component = component
        self.var = var
        self.var_name = var_name
        self.ui_state = ui_state
        self.custom_validator = custom_validator
        self.validation_state = validation_state

        try:
            self.original_border_color = component.cget("border_color")
        except Exception:
            self.original_border_color = "gray50"

        # Replace manual debounce logic with DebounceTimer
        self.debounce_timer = DebounceTimer(
            widget=component,
            delay_ms=COMPONENT_VALIDATION_SETTINGS.debounce_stop_typing_ms,
            callback=lambda: self.validate_value(
                self.var.get(),
                COMPONENT_VALIDATION_SETTINGS.debounced_invalid_revert_ms
            )
        )

        self.revert_after_id = None
        self.touched = False
        self.last_valid_value = var.get()

        self.validation_tooltip = ToolTip(component, text="", hover_only=False, track_movement=True, wide=True)
        component._validation_tooltip = self.validation_tooltip

    def _cancel_after(self, after_id):
        with contextlib.suppress(Exception):
            self.component.after_cancel(after_id)

    def _reset_border(self):
        self.component.configure(border_color=self.original_border_color)

    def should_show_tooltip(self) -> bool:
        try:
            return _safe_bool(self.ui_state.get_var("validation_show_tooltips"))
        except (KeyError, AttributeError):
            return True

    def _show_validation_tooltip(self):
        if not self.should_show_tooltip() or not self.validation_state:
            return
        if self.validation_state.status == 'error':
            self.validation_tooltip.show_error(self.validation_state.message, duration_ms=None)
        elif self.validation_state.status == 'warning':
            self.validation_tooltip.show_warning(self.validation_state.message, duration_ms=None)

    def validate_value(self, value: str, revert_delay_ms: int | None) -> bool:
        self._cancel_after(self.revert_after_id)
        meta = self.ui_state.get_field_metadata(self.var_name)

        basic_result = validate_basic_type(
            value=value,
            declared_type=meta.type,
            nullable=meta.nullable,
            default_val=meta.default
        )

        if not basic_result.ok:
            return self._fail(basic_result.message, revert_delay_ms)

        if self.custom_validator:
            result = self.custom_validator(value)

            # Handle based on status
            if result.status == 'warning':
                return self._warning(result.message, value)
            elif not result.ok:
                return self._fail(result.message, revert_delay_ms)

        return self._success(value)

    def _success(self, value: str) -> bool:
        self._reset_border()
        self.validation_tooltip.hide()
        self.last_valid_value = value
        return True

    def _warning(self, reason: str, value: str) -> bool:
        self.component.configure(border_color="#ff9500")
        if self.should_show_tooltip():
            self.validation_tooltip.show_warning(reason)
        self.last_valid_value = value

        if self.validation_state:
            self.validation_state.set_status('warning', reason)

        return True

    def _fail(self, reason: str, revert_delay_ms: int | None) -> bool:
        self.component.configure(border_color="#dc3545")
        if self.should_show_tooltip():
            self.validation_tooltip.show_error(reason)

        if self.validation_state:
            self.validation_state.set_status('error', reason)

        if revert_delay_ms is not None:
            self.revert_after_id = self.component.after(revert_delay_ms, self._do_revert)
        else:
            self._do_revert()
        return False

    def _do_revert(self):
        self.var.set(self.last_valid_value)
        self._reset_border()
        self.validation_tooltip.hide()

    def debounced_validate(self, *_):
        if not self.touched:
            return

        self.validation_tooltip.hide()
        self._reset_border()

        self._cancel_after(self.revert_after_id)

        # Use DebounceTimer instead of manual after() calls
        self.debounce_timer.call()

    def on_focus_in(self, _e=None):
        self.touched = False
        self._show_validation_tooltip()

    def on_user_input(self, _e=None):
        self.touched = True

    def on_focus_out(self, _e=None):
        self.validation_tooltip.hide()

        if self.touched:
            self.validate_value(
                self.var.get(),
                COMPONENT_VALIDATION_SETTINGS.focusout_invalid_revert_ms
            )

    def cleanup(self):
        self._cancel_after(self.revert_after_id)
        # No need to cancel debounce_timer - it handles its own cleanup


class ModelOutputValidator:

    def __init__(
        self,
        var: tk.Variable,
        ui_state: UIState,
        format_var_name: str = "output_model_format",
        method_var_name: str = "training_method",
        prefix_var_name: str = "save_filename_prefix",
    ):
        self.var = var
        self.ui_state = ui_state
        self.format_var = ui_state.get_var(format_var_name)
        self.method_var = ui_state.get_var(method_var_name)
        self.prefix_var = ui_state.get_var(prefix_var_name)
        self.autocorrect_var = ui_state.get_var("validation_auto_correct")
        self.friendly_names_var = ui_state.get_var("use_friendly_names")
        self.prevent_overwrite_var = ui_state.get_var("prevent_overwrite")
        self.auto_prefix_var = ui_state.get_var("auto_prefix")
        self.show_tooltips_var = ui_state.get_var("validation_show_tooltips")

        self.state = ValidationState()
        self._trace_ids: dict[str, str] = {}

        # Replace manual debounce with DebounceTimer
        self._debounce_timer = None
        self._tk_widget = None
        self._last_prefix = self.prefix_var.get() if self.prefix_var else ""

    def _get_enum_value(self, var, default_enum):
        with contextlib.suppress(KeyError, ValueError):
            return type(default_enum)[var.get()]
        return default_enum

    def validate(self, value: str, skip_overwrite_protection: bool = False, readonly: bool = False) -> ValidationResult:
        value = value.strip()
        if not value:
            self.state.clear()
            return ValidationResult(ok=True, corrected=None, message="", status='success')

        # Use validation logic from validation.py
        result = validate_destination(
            value,
            output_format=self._get_enum_value(self.format_var, ModelFormat.SAFETENSORS),
            training_method=self._get_enum_value(self.method_var, TrainingMethod.FINE_TUNE),
            autocorrect=False if readonly else _safe_bool(self.autocorrect_var),
            prefix=self.prefix_var.get() if self.prefix_var else "",
            use_friendly_names=_safe_bool(self.friendly_names_var, default=False),
            is_output=True,
            prevent_overwrite=False if readonly else _safe_bool(self.prevent_overwrite_var, default=False),
            auto_prefix=False if readonly else _safe_bool(self.auto_prefix_var, default=False),
            skip_overwrite_protection=skip_overwrite_protection,
        )

        if result.status:
            self.state.set_status(result.status, result.message)
        else:
            self.state.clear()

        # Only apply corrections if not in readonly mode
        if not readonly and result.corrected and result.corrected != value:
            self.var.set(result.corrected)

        return result

    def _remove_old_prefix_if_needed(self):
        current_value = self.var.get().strip()
        if not current_value or not self._last_prefix:
            return

        path = Path(current_value)
        filename = path.name
        old_prefix_pattern = f"{self._last_prefix}-"

        if filename.startswith(old_prefix_pattern):
            new_filename = filename[len(old_prefix_pattern):]
            new_value = str(path.parent / new_filename) if path.parent != Path('.') else new_filename
            self.var.set(new_value)

    def _schedule_validation(self, skip_overwrite: bool = False):
        if not self._tk_widget:
            return

        if not self._debounce_timer:
            self._debounce_timer = DebounceTimer(
                widget=self._tk_widget,
                delay_ms=COMPONENT_VALIDATION_SETTINGS.debounce_stop_typing_ms,
                callback=lambda: self.validate(self.var.get(), skip_overwrite_protection=skip_overwrite)
            )

        self._debounce_timer.call()

    def _schedule_prefix_change_validation(self):
        if not self._tk_widget:
            return

        def on_prefix_change():
            self._remove_old_prefix_if_needed()
            self._last_prefix = self.prefix_var.get() if self.prefix_var else ""
            self.validate(self.var.get(), skip_overwrite_protection=False)

        if not self._debounce_timer:
            self._debounce_timer = DebounceTimer(
                widget=self._tk_widget,
                delay_ms=COMPONENT_VALIDATION_SETTINGS.debounce_stop_typing_ms,
                callback=on_prefix_change
            )

        self._debounce_timer.call()

    def setup_traces(self):
        trace_config = [
            ('format', self.format_var, False, True, False),
            ('method', self.method_var, False, True, False),
            ('prefix', self.prefix_var, True, False, True),
            ('friendly_names', self.friendly_names_var, False, True, False),
            ('prevent_overwrite', self.prevent_overwrite_var, False, True, False),
            ('auto_prefix', self.auto_prefix_var, False, True, False),
        ]

        def make_callback(debounce: bool, skip_overwrite: bool, is_prefix: bool):
            if is_prefix:
                return lambda *_: self._schedule_prefix_change_validation()
            elif debounce:
                return lambda *_: self._schedule_validation(skip_overwrite)
            return lambda *_: self.validate(self.var.get(), skip_overwrite_protection=skip_overwrite)

        for key, var, debounce, skip_overwrite, is_prefix in trace_config:
            self._trace_ids[key] = var.trace_add("write", make_callback(debounce, skip_overwrite, is_prefix))

    def cleanup_traces(self):
        for key, trace_id in self._trace_ids.items():
            var = getattr(self, f"{key}_var", None)
            if var:
                with contextlib.suppress(Exception):
                    var.trace_remove("write", trace_id)
        self._trace_ids.clear()

    def _perform_initial_validation(self):
        """Perform initial readonly validation on load without any corrections."""
        current_value = self.var.get().strip()
        if not current_value or not self._tk_widget:
            return

        # Perform readonly validation - no corrections, just check and show status
        self.validate(current_value, skip_overwrite_protection=True, readonly=True)

        # Apply visual feedback based on validation state
        if self.state.status == 'error':
            self._tk_widget.configure(border_color="#dc3545")
            if hasattr(self._tk_widget, '_validation_tooltip'):
                self._tk_widget._validation_tooltip.show_error(self.state.message, duration_ms=5000)
        elif self.state.status == 'warning':
            self._tk_widget.configure(border_color="#ff9500")
            if hasattr(self._tk_widget, '_validation_tooltip'):
                self._tk_widget._validation_tooltip.show_warning(self.state.message, duration_ms=5000)

    def set_widget(self, widget):
        self._tk_widget = widget
        # Perform initial readonly validation if tooltips are enabled
        if _safe_bool(self.show_tooltips_var):
            self._perform_initial_validation()


# UI components

def entry(
        master,
        row,
        column,
        ui_state: UIState,
        var_name: str,
        command: Callable[[], None] | None = None,
        tooltip: str = "",
        wide_tooltip: bool = False,
        width: int = 140,
        sticky: str = "new",
        max_undo: int | None = None,
        validator_factory: Callable[..., FieldValidator] | None = None,
        extra_validate: Callable[[str], str | None] | None = None,
        required: bool = False,
):

    var = ui_state.get_var(var_name)
    trace_id = None
    if command:
        trace_id = ui_state.add_var_trace(var_name, command)

    component = ctk.CTkEntry(master, textvariable=var, width=width)
    component.grid(row=row, column=column, padx=PAD, pady=PAD, sticky=sticky)

    if validator_factory is not None:
        validator = validator_factory(
            component, var, ui_state, var_name,
            max_undo=max_undo or DEFAULT_MAX_UNDO,
            extra_validate=extra_validate,
            required=required,
        )
    else:
        validator = FieldValidator(
            component, var, ui_state, var_name,
            max_undo=max_undo or DEFAULT_MAX_UNDO,
            extra_validate=extra_validate,
            required=required,
        )
    validator.attach()
    component._validator = validator  # type: ignore[attr-defined]

    original_destroy = component.destroy

    def new_destroy():
        # 'temporary' fix until https://github.com/TomSchimansky/CustomTkinter/pull/2077 is merged
        # unfortunately Tom has admitted to forgetting about how to maintain CTK so this likely will never be merged
        if component._textvariable_callback_name:
            component._textvariable.trace_remove("write", component._textvariable_callback_name)  # type: ignore[union-attr]
            component._textvariable_callback_name = ""

        validator.detach()

        if command is not None and trace_id is not None:
            ui_state.remove_var_trace(var_name, trace_id)

        original_destroy()

    component.destroy = new_destroy  # type: ignore[assignment]

    if tooltip:
        ToolTip(component, tooltip, wide=wide_tooltip)

    return component


def path_entry(
        master, row, column, ui_state: UIState, var_name: str,
        *,
        mode: Literal["file", "dir"] = "file",
        io_type: PathIOType = PathIOType.INPUT,
        path_modifier: Callable[[str], str] | None = None,
        allow_model_files: bool = True,
        allow_image_files: bool = False,
        command: Callable[[str], None] | None = None,
        required: bool = False,
):
    frame = ctk.CTkFrame(master, fg_color="transparent")
    frame.grid(row=row, column=column, padx=1, pady=1, sticky=sticky)
    frame.grid_columnconfigure(0, weight=1)

    def _path_validator_factory(comp, var, state, name, **kw):
        return PathValidator(comp, var, state, name, io_type=io_type, **kw)

    entry_component = entry(
        frame, row=0, column=0, ui_state=ui_state, var_name=var_name,
        validator_factory=_path_validator_factory,
        required=required,
    )

    trace_ids = []
    if io_type in (PathIOType.OUTPUT, PathIOType.MODEL):
        validator = getattr(entry_component, '_validator', None)
        if validator is not None:
            for dep_var_name in ("prevent_overwrites", "output_model_format"):
                with contextlib.suppress(KeyError, AttributeError):
                    dep_var = ui_state.get_var(dep_var_name)
                    tid = dep_var.trace_add("write", lambda *_a: validator.revalidate())
                    trace_ids.append((dep_var, tid))

    use_save_dialog = io_type in (PathIOType.OUTPUT, PathIOType.MODEL)

    def __open_dialog():
        if mode == "dir":
            chosen = filedialog.askdirectory()
        else:
            filetypes = [
                ("All Files", "*.*"),
            ]

            if allow_model_files:
                filetypes.extend([
                    ("Diffusers", "model_index.json"),
                    ("Checkpoint", "*.ckpt *.pt *.bin"),
                    ("Safetensors", "*.safetensors"),
                ])
            if allow_image_files:
                filetypes.extend([
                    ("Image", ' '.join([f"*.{x}" for x in supported_image_extensions()])),
                ])

            if use_save_dialog:
                chosen = filedialog.asksaveasfilename(filetypes=filetypes)
            else:
                chosen = filedialog.askopenfilename(filetypes=filetypes)

        if chosen:
            if path_modifier:
                chosen = path_modifier(chosen)

            ui_state.get_var(var_name).set(chosen)

            if command:
                command(chosen)

    button_component = ctk.CTkButton(frame, text="...", width=40, command=open_dialog)
    button_component.grid(row=0, column=1, padx=(0, PAD), pady=PAD, sticky="nsew")

    if trace_ids:
        original_frame_destroy = frame.destroy
        def _frame_destroy():
            for dep_var, tid in trace_ids:
                with contextlib.suppress(tk.TclError, ValueError):
                    dep_var.trace_remove("write", tid)
            original_frame_destroy()
        frame.destroy = _frame_destroy  # type: ignore[assignment]

    return frame


def time_entry(master, row, column, ui_state: UIState, var_name: str, unit_var_name, supports_time_units: bool = True):
    frame = ctk.CTkFrame(master, fg_color="transparent")
    frame.grid(row=row, column=column, padx=0, pady=0, sticky="new")

    frame.grid_columnconfigure(0, weight=0)
    frame.grid_columnconfigure(1, weight=1)

    entry(frame, row=0, column=0, ui_state=ui_state, var_name=var_name, width=width, sticky="nw")

    values = [str(x) for x in list(TimeUnit)]
    if not supports_time_units:
        values = [str(x) for x in list(TimeUnit) if not x.is_time_unit()]

    unit_component = ctk.CTkOptionMenu(
        frame,
        values=values,
        variable=ui_state.get_var(unit_var_name),
        width=unit_width,
    )
    unit_component.grid(row=0, column=1, padx=(0, PAD), pady=PAD, sticky="nw")

    return frame

def layer_filter_entry(master, row, column, ui_state: UIState, preset_var_name: str, preset_label: str, preset_tooltip: str, presets, entry_var_name, entry_tooltip: str, regex_var_name, regex_tooltip: str, frame_color=None):
    frame = ctk.CTkFrame(master=master, corner_radius=5, fg_color=frame_color)
    frame.grid(row=row, column=column, padx=5, pady=5, sticky="nsew")
    frame.grid_columnconfigure(0, weight=1)

    layer_entry = entry(
        frame, 1, 0, ui_state, entry_var_name,
        tooltip=entry_tooltip
    )
    layer_entry_fg_color = layer_entry.cget("fg_color")
    layer_entry_text_color = layer_entry.cget("text_color")

    regex_label = label(
        frame, 2, 0, "Use Regex",
        tooltip=regex_tooltip,
    )
    regex_switch = switch(
        frame, 2, 1, ui_state, regex_var_name
    )

    # Let the user set their own layer filter
    # TODO
    #if self.train_config.layer_filter and self.train_config.layer_filter_preset == "custom":
    #    self.prior_custom = self.train_config.layer_filter
    #else:
    #    self.prior_custom = ""

    layer_entry.grid_configure(columnspan=2, sticky="ew")

    presets_list = list(presets.keys()) + ["custom"]


    def hide_layer_entry():
        if layer_entry and layer_entry.winfo_manager():
            layer_entry.grid_remove()

    def show_layer_entry():
        if layer_entry and not layer_entry.winfo_manager():
            layer_entry.grid()


    def preset_set_layer_choice(selected: str):
        if not selected or selected not in presets_list:
            selected = presets_list[0]

        if selected == "custom":
            # Allow editing + regex toggle
            show_layer_entry()
            layer_entry.configure(state="normal", fg_color=layer_entry_fg_color, text_color=layer_entry_text_color)
            #layer_entry.cget('textvariable').set("")
            regex_label.grid()
            regex_switch.grid()
        else:
            # Preserve custom text before overwriting
            #if self.prior_selected == "custom":
            #    self.prior_custom = self.layer_entry.get()

            # Resolve preset definition (list[str] OR {'patterns': [...], 'regex': bool})
            preset_def = presets.get(selected, [])
            if isinstance(preset_def, dict):
                patterns = preset_def.get("patterns", [])
                preset_uses_regex = bool(preset_def.get("regex", False))
            else:
                patterns = preset_def
                preset_uses_regex = False

            disabled_color = ("gray85", "gray17")
            disabled_text_color = ("gray30", "gray70")
            layer_entry.configure(state="disabled", fg_color=disabled_color, text_color=disabled_text_color)
            layer_entry.cget('textvariable').set(",".join(patterns))

            ui_state.get_var(entry_var_name).set(",".join(patterns))
            ui_state.get_var(regex_var_name).set(preset_uses_regex)

            regex_label.grid_remove()
            regex_switch.grid_remove()

            if selected == "full" and not patterns:
                hide_layer_entry()
            else:
                show_layer_entry()

#        self.prior_selected = selected

    label(frame, 0, 0, preset_label,
                     tooltip=preset_tooltip)


    ui_state.remove_all_var_traces(preset_var_name)

    layer_selector = options(
        frame, 0, 1, presets_list, ui_state, preset_var_name,
        command=preset_set_layer_choice
    )

    def on_layer_filter_preset_change():
        if not layer_selector:
            return
        selected = ui_state.get_var(preset_var_name).get()
        preset_set_layer_choice(selected)

    ui_state.add_var_trace(
        preset_var_name,
        on_layer_filter_preset_change,
    )

    preset_set_layer_choice(layer_selector.get())

def icon_button(master, row, column, text, command):
    component = ctk.CTkButton(master, text=text, width=40, command=command)
    component.grid(row=row, column=column, padx=PAD, pady=PAD, sticky="new")
    return component


def button(master, row, column, text, command, tooltip=None, **kwargs):
    # Pop grid-specific parameters from kwargs, using PAD as the default if not provided.
    padx = kwargs.pop('padx', PAD)
    pady = kwargs.pop('pady', PAD)

    component = ctk.CTkButton(master, text=text, command=command, **kwargs)
    component.grid(row=row, column=column, padx=padx, pady=pady, sticky="new")
    if tooltip:
        ToolTip(component, tooltip, x_position=25)
    return component


def options(master, row, column, values, ui_state: UIState, var_name: str, command: Callable[[str], None] | None = None):
    component = ctk.CTkOptionMenu(master, values=values, variable=ui_state.get_var(var_name), command=command)
    component.grid(row=row, column=column, padx=PAD, pady=(PAD, PAD), sticky="new")

    # temporary fix until https://github.com/TomSchimansky/CustomTkinter/pull/2246 is merged
    def create_destroy(component):
        orig_destroy = component.destroy

        def destroy(self):
            orig_destroy()
            CTkScalingBaseClass.destroy(self)

        return destroy

    destroy = create_destroy(component._dropdown_menu)
    component._dropdown_menu.destroy = lambda: destroy(component._dropdown_menu)  # type: ignore[assignment]

    return component


def options_adv(master, row, column, values, ui_state: UIState, var_name: str,
                command: Callable[[str], None] | None = None, adv_command: Callable[[], None] | None = None):
    frame = ctk.CTkFrame(master, fg_color="transparent")
    frame.grid(row=row, column=column, padx=0, pady=0, sticky="new")

    frame.grid_columnconfigure(0, weight=1)

    component = ctk.CTkOptionMenu(frame, values=values, variable=ui_state.get_var(var_name), command=command)
    component.grid(row=0, column=0, padx=PAD, pady=(PAD, PAD), sticky="new")

    button_component = ctk.CTkButton(frame, text="…", width=20, command=adv_command)
    button_component.grid(row=0, column=1, padx=(0, PAD), pady=PAD, sticky="nsew")

    if command:
        command(ui_state.get_var(var_name).get())  # call command once to set the initial value

    # temporary fix until https://github.com/TomSchimansky/CustomTkinter/pull/2246 is merged
    def create_destroy(component):
        orig_destroy = component.destroy

        def destroy(self):
            orig_destroy()
            CTkScalingBaseClass.destroy(self)

        return destroy

    destroy = create_destroy(component._dropdown_menu)
    component._dropdown_menu.destroy = lambda: destroy(component._dropdown_menu)  # type: ignore[assignment]

    return frame, {'component': component, 'button_component': button_component}


def options_kv(master, row, column, values: list[tuple[str, Any]], ui_state: UIState, var_name: str,
               command: Callable[[Any], None] | None = None):
    var = ui_state.get_var(var_name)

    if var.get() not in [str(value) for key, value in values] and values:
        var.set(values[0][1])

    deactivate_update_var = False

    def update_component(text):
        for key, value in values:
            if text == key:
                nonlocal deactivate_update_var
                deactivate_update_var = True
                var.set(value)
                if command:
                    command(value)
                deactivate_update_var = False
                break

    component = ctk.CTkOptionMenu(master, values=[key for key, _ in values], command=update_component, width=width)
    component.grid(row=row, column=column, padx=PAD, pady=(PAD, PAD), sticky=sticky)

    def update_var():
        if not deactivate_update_var:
            for key, value in values:
                if var.get() == str(value):
                    if component.winfo_exists():
                        component.set(key)
                        if command:
                            command(value)
                        break

    var.trace_add("write", lambda _0, _1, _2: update_var())
    update_var()  # call update_var once to set the initial value

    # temporary fix until https://github.com/TomSchimansky/CustomTkinter/pull/2246 is merged
    def create_destroy(component):
        orig_destroy = component.destroy

        def destroy(self):
            orig_destroy()
            CTkScalingBaseClass.destroy(self)

        return destroy

    destroy = create_destroy(component._dropdown_menu)
    component._dropdown_menu.destroy = lambda: destroy(component._dropdown_menu)  # type: ignore[assignment]

    return component


def switch(
        master,
        row,
        column,
        ui_state: UIState,
        var_name: str,
        command: Callable[[], None] | None = None,
        text: str = "",
):
    var = ui_state.get_var(var_name)
    if command:
        trace_id = ui_state.add_var_trace(var_name, command)

    component = ctk.CTkSwitch(master, variable=var, text=text, command=command)
    component.grid(row=row, column=column, padx=PAD, pady=(PAD, PAD), sticky="new")

    original_destroy = component.destroy

    def new_destroy():
        if command is not None:
            ui_state.remove_var_trace(var_name, trace_id)
        original_destroy()

            orig_destroy()

        return destroy

    destroy = create_destroy(component)
    component.destroy = lambda: destroy(component)  # type: ignore[assignment]

    return component


def labeled_switch(
        master,
        row,
        column,
        ui_state: UIState,
        var_name: str,
        label_text: str,
        command: Callable[[], None] = None,
        tooltip: str = "",
        wide_tooltip: bool = False,
        layout: Literal["row", "column"] = "row",
        label_pad: tuple[int, int] = (10, 5),
        switch_pad: tuple[int, int] = (10, 5),
        frame_pad: tuple[int, int] = (0, 0),
        sticky: str = "new",
        columnspan: int = 1,
):
    # For horizontal (row) layout: place directly into parent grid (no wrapper frame)
    if layout == "row":
        label_component = label(master, row, column, label_text,
                                pad=label_pad, tooltip=tooltip, wide_tooltip=wide_tooltip)
        switch_component = switch(master, row, column + 1, ui_state, var_name, command=command)
        return None, {'label': label_component, 'switch': switch_component}

    # Column layout keeps wrapper frame
    frame = ctk.CTkFrame(master, fg_color="transparent")
    frame.grid(row=row, column=column, columnspan=columnspan,
               padx=frame_pad[0], pady=frame_pad[1], sticky=sticky)

    frame.grid_rowconfigure(0, weight=0)
    frame.grid_rowconfigure(1, weight=0)

    label_component = label(frame, 0, 0, label_text,
                            pad=label_pad, tooltip=tooltip, wide_tooltip=wide_tooltip)
    switch_component = switch(frame, 1, 0, ui_state, var_name, command=command)

    return frame, {'label': label_component, 'switch': switch_component}

def progress(master, row, column):
    component = ctk.CTkProgressBar(master)
    component.grid(row=row, column=column, padx=PAD, pady=(PAD, PAD), sticky="ew")
    return component


def double_progress(master, row, column, label_1, label_2):
    frame = ctk.CTkFrame(master, fg_color="transparent")
    frame.grid(row=row, column=column, padx=0, pady=0, sticky="nsew")

    frame.grid_rowconfigure(0, weight=1)
    frame.grid_rowconfigure(1, weight=1)
    frame.grid_columnconfigure(0, weight=1)

    label_1_component = ctk.CTkLabel(frame, text=label_1)
    label_1_component.grid(row=0, column=0, padx=(PAD, PAD), pady=(0, 0), sticky="new")

    label_2_component = ctk.CTkLabel(frame, text=label_2)
    label_2_component.grid(row=1, column=0, padx=(PAD, PAD), pady=(0, 0), sticky="sew")

    progress_1_component = ctk.CTkProgressBar(frame)
    progress_1_component.grid(row=0, column=1, padx=(PAD, PAD), pady=(PAD, 0), sticky="new")

    progress_2_component = ctk.CTkProgressBar(frame)
    progress_2_component.grid(row=1, column=1, padx=(PAD, PAD), pady=(0, PAD), sticky="sew")

    description_1_component = ctk.CTkLabel(frame, text="")
    description_1_component.grid(row=0, column=2, padx=(PAD, PAD), pady=(0, 0), sticky="new")

    description_2_component = ctk.CTkLabel(frame, text="")
    description_2_component.grid(row=1, column=2, padx=(PAD, PAD), pady=(0, 0), sticky="sew")

    def set_1(value, max_value):
        progress_1_component.set(value / max_value)
        description_1_component.configure(text=f"{value}/{max_value}")

    def set_2(value, max_value):
        progress_2_component.set(value / max_value)
        description_2_component.configure(text=f"{value}/{max_value}")

    return set_1, set_2
