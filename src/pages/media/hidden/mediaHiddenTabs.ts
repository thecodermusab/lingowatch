import type { MediaTabDefinition } from "../mediaTypes";

export const HIDDEN_MEDIA_TABS: MediaTabDefinition[] = [
  { id: "netflix", label: "Netflix", available: false },
  { id: "fsi_dli", label: "FSI/DLI", available: false },
  { id: "media_file", label: "Media file", available: false, badge: "NEW" },
  { id: "resources", label: "Resources", available: false },
];
