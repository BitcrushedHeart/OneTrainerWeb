import { SectionCard, FormEntry, FilePicker, Toggle, Select } from "@/components/shared";
import { CloudTypeValues, CloudFileSyncValues, CloudActionValues } from "@/types/generated/enums";

export default function CloudPage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Column 1: Connection */}
      <SectionCard title="Connection">
        <div className="flex flex-col gap-4">
          <Toggle configPath="cloud.enabled" label="Enable Cloud" tooltip="Enable cloud training" />
          <Select
            label="Cloud Type"
            configPath="cloud.type"
            options={[...CloudTypeValues]}
            tooltip="Cloud provider"
          />
          <Select
            label="File Sync"
            configPath="cloud.file_sync"
            options={[...CloudFileSyncValues]}
            tooltip="File synchronization method"
          />
          <FormEntry label="API Key" configPath="secrets.cloud.api_key" tooltip="Cloud API key" />
          <FormEntry label="Hostname" configPath="secrets.cloud.host" tooltip="Cloud hostname" />
          <FormEntry label="Port" configPath="secrets.cloud.port" tooltip="SSH port" />
          <FormEntry label="User" configPath="secrets.cloud.user" tooltip="SSH user" />
          <FilePicker label="SSH Key File" configPath="secrets.cloud.key_file" tooltip="Path to SSH key file" />
          <FormEntry label="Password" configPath="secrets.cloud.password" tooltip="SSH password" />
          <FormEntry label="Cloud ID" configPath="secrets.cloud.id" tooltip="Cloud instance ID" />
          <Toggle configPath="cloud.tensorboard_tunnel" label="Tensorboard Tunnel" />
        </div>
      </SectionCard>

      {/* Column 2: Setup */}
      <SectionCard title="Setup">
        <div className="flex flex-col gap-4">
          <FormEntry label="Remote Directory" configPath="cloud.remote_dir" />
          <FormEntry label="OneTrainer Directory" configPath="cloud.onetrainer_dir" />
          <FormEntry label="HuggingFace Cache Dir" configPath="cloud.huggingface_cache_dir" />
          <Toggle configPath="cloud.install_onetrainer" label="Install OneTrainer" />
          <FormEntry label="Install Command" configPath="cloud.install_cmd" />
          <Toggle configPath="cloud.update_onetrainer" label="Update OneTrainer" />
          <Toggle configPath="cloud.detach_trainer" label="Detach Trainer" />
          <FormEntry label="Run ID" configPath="cloud.run_id" />
          <Toggle configPath="cloud.download_samples" label="Download Samples" />
          <Toggle configPath="cloud.download_output_model" label="Download Output Model" />
          <Toggle configPath="cloud.download_saves" label="Download Saves" />
          <Toggle configPath="cloud.download_backups" label="Download Backups" />
          <Toggle configPath="cloud.download_tensorboard" label="Download Tensorboard" />
          <Toggle configPath="cloud.delete_workspace" label="Delete Workspace" />
        </div>
      </SectionCard>

      {/* Column 3: Cloud Creation */}
      <SectionCard title="Cloud Creation">
        <div className="flex flex-col gap-4">
          <Toggle configPath="cloud.create" label="Create Cloud" />
          <FormEntry label="Cloud Name" configPath="cloud.name" />
          <FormEntry label="Sub Type" configPath="cloud.sub_type" />
          <FormEntry label="GPU Type" configPath="cloud.gpu_type" />
          <FormEntry label="Volume Size" configPath="cloud.volume_size" type="number" />
          <FormEntry label="Min Download" configPath="cloud.min_download" type="number" />
          <Select label="On Finish" configPath="cloud.on_finish" options={[...CloudActionValues]} />
          <Select label="On Error" configPath="cloud.on_error" options={[...CloudActionValues]} />
          <Select
            label="On Detached Finish"
            configPath="cloud.on_detached_finish"
            options={[...CloudActionValues]}
          />
          <Select
            label="On Detached Error"
            configPath="cloud.on_detached_error"
            options={[...CloudActionValues]}
          />
        </div>
      </SectionCard>
    </div>
  );
}
