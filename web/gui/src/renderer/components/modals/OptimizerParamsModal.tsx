import { useState } from "react";
import { ModalBase } from "./ModalBase";
import { FormEntry, Toggle, Button } from "@/components/shared";
import { useConfigField } from "@/hooks/useConfigField";
import { useConfigStore } from "@/store/configStore";
import { MuonAdamModal } from "./MuonAdamModal";
import type { Optimizer } from "@/types/generated/enums";

export interface OptimizerParamsModalProps {
  open: boolean;
  onClose: () => void;
}

// Common optimizer params - shown based on optimizer type
const COMMON_NUMERIC_PARAMS = [
  "beta1", "beta2", "beta3", "eps", "eps2", "weight_decay", "momentum", "dampening",
  "alpha", "d0", "d_coef", "growth_rate", "clip_threshold", "decay_rate",
  "lr_decay", "max_unorm", "min_8bit_size", "quant_block_size", "percentile_clipping",
  "r", "weight_lr_power", "k", "xi", "n_sma_threshold", "slice_p",
  "initial_accumulator_value", "initial_accumulator", "log_every", "optim_bits",
  "prodigy_steps", "schedulefree_c", "ns_steps", "kappa_p",
  "muon_adam_lr", "muon_te1_adam_lr", "muon_te2_adam_lr",
  "beta3_ema", "alpha_grad", "beta1_warmup", "min_beta1", "k_warmup_steps",
  "beta2_normuon", "normuon_eps", "ortho_rank",
];

const COMMON_BOOL_PARAMS = [
  "adam_w_mode", "amsgrad", "bias_correction", "block_wise", "capturable", "centered",
  "decouple", "differentiable", "fused", "fused_back_pass", "is_paged",
  "maximize", "nesterov", "no_prox", "relative_step", "safeguard_warmup",
  "scale_parameter", "stochastic_rounding", "use_bias_correction", "use_triton",
  "warmup_init", "decoupled_decay", "fixed_decay", "rectify", "degenerated_to_sgd",
  "ams_bound", "adanorm", "adam_debias", "cautious", "weight_decay_by_lr",
  "use_speed", "split_groups", "split_groups_mean", "factored", "factored_fp32",
  "use_stableadamw", "use_cautious", "use_grams", "use_adopt",
  "use_orthograd", "nnmf_factor", "orthogonal_gradient", "use_atan2", "use_AdEMAMix",
  "Simplified_AdEMAMix", "cautious_mask", "grams_moment", "kourkoutas_beta",
  "MuonWithAuxAdam", "muon_adam_regex", "normuon_variant", "low_rank_ortho",
  "accelerated_ns", "cautious_wd", "approx_mars", "auto_kappa_p", "compile",
  "fsdp_in_use", "foreach", "d_limiter", "use_schedulefree", "rms_rescaling",
];

export function OptimizerParamsModal({ open, onClose }: OptimizerParamsModalProps) {
  const [optimizer] = useConfigField<Optimizer>("optimizer.optimizer");
  const [muonAdamOpen, setMuonAdamOpen] = useState(false);
  const changeOptimizer = useConfigStore((s) => s.changeOptimizer);

  const optimizerName = optimizer as string | undefined;

  return (
    <ModalBase open={open} onClose={onClose} title={`${optimizer ?? "Optimizer"} Parameters`} size="lg">
      <div className="flex gap-2 mb-4">
        <Button variant="secondary" size="sm" onClick={() => { if (optimizerName) changeOptimizer(optimizerName); }}>
          Load Defaults
        </Button>
        {optimizerName && (optimizerName.includes("MUON") || optimizerName.includes("ADAMUON")) && (
          <Button variant="secondary" size="sm" onClick={() => setMuonAdamOpen(true)}>
            Muon + Adam Settings
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold text-[var(--color-on-surface-secondary)] uppercase tracking-wide">Numeric Parameters</h4>
          {COMMON_NUMERIC_PARAMS.map((param) => (
            <FormEntry key={param} label={param} configPath={`optimizer.${param}`} type="number" nullable />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold text-[var(--color-on-surface-secondary)] uppercase tracking-wide">Boolean Parameters</h4>
          {COMMON_BOOL_PARAMS.map((param) => (
            <Toggle key={param} configPath={`optimizer.${param}`} label={param} />
          ))}
          <FormEntry label="muon_hidden_layers" configPath="optimizer.muon_hidden_layers" tooltip="Comma-separated hidden layer filter for Muon optimizer" nullable />
        </div>
      </div>
      <div className="flex justify-end mt-6 pt-4 border-t border-[var(--color-border-subtle)]">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-[var(--radius-sm)] text-sm font-medium
            bg-transparent border border-[var(--color-border-subtle)]
            text-[var(--color-on-surface)] hover:border-[var(--color-orchid-600)]
            transition-colors duration-200 cursor-pointer"
        >
          Close
        </button>
      </div>
      <MuonAdamModal open={muonAdamOpen} onClose={() => setMuonAdamOpen(false)} />
    </ModalBase>
  );
}
