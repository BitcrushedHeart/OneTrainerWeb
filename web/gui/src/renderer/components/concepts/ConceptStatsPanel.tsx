import { useState, useCallback } from "react";
import { Button } from "@/components/shared";
import { configApi } from "@/api/configApi";
import { AspectBucketChart } from "./AspectBucketChart";

export interface ConceptStatsPanelProps {
  conceptPath: string;
  includeSubdirectories: boolean;
}

interface StatValue {
  label: string;
  value: string;
  tooltip?: string;
}

function formatPixelStat(raw: unknown): string {
  if (typeof raw === "string") return "-";
  if (Array.isArray(raw)) {
    const [pixels, file, resolution] = raw;
    const mp = (pixels / 1_000_000).toFixed(2);
    return `${mp} MP, ${resolution}\n${file}`;
  }
  if (typeof raw === "number") {
    const mp = (raw / 1_000_000).toFixed(2);
    const side = Math.round(Math.sqrt(raw));
    return `${mp} MP, ~${side}w x ${side}h`;
  }
  return "-";
}

function formatLengthStat(raw: unknown): string {
  if (typeof raw === "string") return "-";
  if (Array.isArray(raw)) return `${Math.round(raw[0])} frames\n${raw[1]}`;
  if (typeof raw === "number") return `${Math.round(raw)} frames`;
  return "-";
}

function formatFpsStat(raw: unknown): string {
  if (typeof raw === "string") return "-";
  if (Array.isArray(raw)) return `${Math.round(raw[0])} fps\n${raw[1]}`;
  if (typeof raw === "number") return `${Math.round(raw)} fps`;
  return "-";
}

function formatCaptionStat(raw: unknown): string {
  if (typeof raw === "string") return "-";
  if (Array.isArray(raw)) {
    if (raw.length >= 3) return `${raw[0]} chars, ${raw[2]} words\n${raw[1]}`;
    if (raw.length >= 2) return `${Math.round(raw[0])} chars, ${Math.round(raw[1])} words`;
  }
  return "-";
}

export function ConceptStatsPanel({ conceptPath, includeSubdirectories }: ConceptStatsPanelProps) {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanType, setScanType] = useState<"basic" | "advanced" | null>(null);

  const runScan = useCallback(async (advanced: boolean) => {
    if (!conceptPath) return;
    setScanning(true);
    setScanType(advanced ? "advanced" : "basic");
    try {
      const result = await configApi.conceptStats(conceptPath, includeSubdirectories, advanced);
      setStats(result);
    } catch (err) {
      console.error("Stats scan failed:", err);
    } finally {
      setScanning(false);
      setScanType(null);
    }
  }, [conceptPath, includeSubdirectories]);

  const handleCancel = useCallback(async () => {
    try {
      await configApi.cancelConceptStats();
    } catch (err) {
      console.error("Cancel failed:", err);
    }
  }, []);

  const s = stats ?? {};

  const fileSize = typeof s.file_size === "number" ? `${Math.round(s.file_size / 1_048_576)} MB` : "-";
  const processingTime = typeof s.processing_time === "number" ? `${(s.processing_time as number).toFixed(2)} s` : "-";

  // Build stat grid sections
  const basicStats: StatValue[][] = [
    [
      { label: "Total Size", value: fileSize },
      { label: "Directories", value: String(s.directory_count ?? "-") },
    ],
    [
      { label: "Total Images", value: String(s.image_count ?? "-") },
      { label: "Total Videos", value: String(s.video_count ?? "-") },
      { label: "Total Masks", value: String(s.mask_count ?? "-") },
      {
        label: "Total Captions",
        value: (s.subcaption_count && typeof s.subcaption_count === "number" && s.subcaption_count > 0)
          ? `${s.caption_count} (${s.subcaption_count})`
          : String(s.caption_count ?? "-"),
      },
    ],
    [
      { label: "Images with Masks", value: String(s.image_with_mask_count ?? "-") },
      { label: "Unpaired Masks", value: String(s.unpaired_masks ?? "-") },
    ],
    [
      { label: "Images with Captions", value: String(s.image_with_caption_count ?? "-") },
      { label: "Videos with Captions", value: String(s.video_with_caption_count ?? "-") },
      { label: "Unpaired Captions", value: String(s.unpaired_captions ?? "-") },
    ],
  ];

  const advancedStats: StatValue[][] = [
    [
      { label: "Max Pixels", value: formatPixelStat(s.max_pixels) },
      { label: "Avg Pixels", value: formatPixelStat(s.avg_pixels) },
      { label: "Min Pixels", value: formatPixelStat(s.min_pixels) },
    ],
    [
      { label: "Max Length", value: formatLengthStat(s.max_length) },
      { label: "Avg Length", value: formatLengthStat(s.avg_length) },
      { label: "Min Length", value: formatLengthStat(s.min_length) },
    ],
    [
      { label: "Max FPS", value: formatFpsStat(s.max_fps) },
      { label: "Avg FPS", value: formatFpsStat(s.avg_fps) },
      { label: "Min FPS", value: formatFpsStat(s.min_fps) },
    ],
    [
      { label: "Max Caption Length", value: formatCaptionStat(s.max_caption_length) },
      { label: "Avg Caption Length", value: formatCaptionStat(s.avg_caption_length) },
      { label: "Min Caption Length", value: formatCaptionStat(s.min_caption_length) },
    ],
  ];

  const aspectBuckets = (s.aspect_buckets ?? {}) as Record<string, number>;
  const hasAspectData = Object.values(aspectBuckets).some((v) => v > 0);

  if (!conceptPath) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-on-surface-secondary)]">
        <p className="text-sm">Set a concept path first to scan for statistics.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          onClick={() => runScan(false)}
          disabled={scanning}
        >
          {scanning && scanType === "basic" ? "Scanning..." : "Refresh Basic"}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => runScan(true)}
          disabled={scanning}
        >
          {scanning && scanType === "advanced" ? "Scanning..." : "Refresh Advanced"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCancel}
          disabled={!scanning}
        >
          Abort Scan
        </Button>
        <span className="ml-auto text-xs text-[var(--color-on-surface-secondary)]">
          {processingTime !== "-" ? `Processed in ${processingTime}` : ""}
        </span>
      </div>

      {stats === null ? (
        <div className="flex flex-col items-center justify-center py-12 text-[var(--color-on-surface-secondary)]">
          <p className="text-sm">Click "Refresh Basic" or "Refresh Advanced" to scan concept statistics.</p>
        </div>
      ) : (
        <>
          {/* Stats grid */}
          <div className="flex flex-col gap-4">
            {basicStats.map((row, ri) => (
              <div key={ri} className="grid grid-cols-4 gap-3">
                {row.map((stat) => (
                  <div key={stat.label} className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-[var(--color-on-surface-secondary)] underline">
                      {stat.label}
                    </span>
                    <span className="text-sm text-[var(--color-on-surface)] whitespace-pre-line">
                      {stat.value}
                    </span>
                  </div>
                ))}
              </div>
            ))}

            {/* Advanced stats (only show if data exists) */}
            {advancedStats.some((row) => row.some((stat) => stat.value !== "-")) && (
              <>
                <div className="border-t border-[var(--color-border-subtle)]" />
                {advancedStats.map((row, ri) => (
                  <div key={`adv-${ri}`} className="grid grid-cols-3 gap-3">
                    {row.map((stat) => (
                      <div key={stat.label} className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold text-[var(--color-on-surface-secondary)] underline">
                          {stat.label}
                        </span>
                        <span className="text-xs text-[var(--color-on-surface)] whitespace-pre-line break-all">
                          {stat.value}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}

            {/* Aspect bucket chart */}
            {hasAspectData && (
              <>
                <div className="border-t border-[var(--color-border-subtle)]" />
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-[var(--color-on-surface-secondary)] underline">
                    Aspect Bucketing
                  </span>
                  <AspectBucketChart buckets={aspectBuckets} />
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
