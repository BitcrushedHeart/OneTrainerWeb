/** A single form field definition used by schema-driven rendering. */
export interface FieldDef {
  /** Dot-notation path into TrainConfig (doubles as React key). */
  key: string;
  label: string;
  /** Field type discriminator. Extensible as new control types are added. */
  type:
    | "entry"
    | "file"
    | "dir"
    | "toggle"
    | "select"
    | "select-kv"
    | "select-adv"
    | "time-entry"
    | "layer-filter";
  tooltip?: string;
  inputType?: "text" | "number";
  nullable?: boolean;
  /** For select-kv: label/value pairs. */
  options?: { label: string; value: string }[];
  /** For select / select-adv: raw enum string values. */
  stringOptions?: string[];
  /** For time-entry: explicit value path (defaults to key). */
  valuePath?: string;
  /** For time-entry: explicit unit path (defaults to key + "_unit"). */
  unitPath?: string;
}

/** A titled group of fields rendered together as a card section. */
export interface SectionDef {
  id: string;
  label: string;
  fields: FieldDef[];
}
