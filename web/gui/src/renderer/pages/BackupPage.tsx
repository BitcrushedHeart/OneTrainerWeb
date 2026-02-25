import { SectionCard, FormEntry, Toggle, TimeEntry, Button } from "@/components/shared";
import { useTrainingStore } from "@/store/trainingStore";

export default function BackupPage() {
  const status = useTrainingStore((s) => s.status);
  const backupNow = useTrainingStore((s) => s.backupNow);
  const saveNow = useTrainingStore((s) => s.saveNow);
  const isActive = status === "training" || status === "preparing";

  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Backup">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TimeEntry
            label="Backup After"
            valuePath="backup_after"
            unitPath="backup_after_unit"
            tooltip="Create a backup after this interval"
          />
          <Toggle configPath="rolling_backup" label="Rolling Backup" tooltip="Enable rolling backups" />
          <FormEntry
            label="Rolling Backup Count"
            configPath="rolling_backup_count"
            type="number"
            tooltip="Number of rolling backups to keep"
          />
          <Toggle
            configPath="backup_before_save"
            label="Backup Before Save"
            tooltip="Create a backup before saving"
          />
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="secondary" disabled={!isActive} onClick={backupNow}>
            Backup Now
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Save">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TimeEntry
            label="Save Every"
            valuePath="save_every"
            unitPath="save_every_unit"
            tooltip="Save the model at this interval"
          />
          <FormEntry
            label="Save Skip First"
            configPath="save_skip_first"
            type="number"
            tooltip="Skip saving for the first N intervals"
          />
          <FormEntry
            label="Save Filename Prefix"
            configPath="save_filename_prefix"
            tooltip="Prefix for saved model filenames"
          />
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="secondary" disabled={!isActive} onClick={saveNow}>
            Save Now
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
