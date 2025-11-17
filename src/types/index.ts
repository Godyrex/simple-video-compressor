export interface FileItem {
  id: string;
  path: string;
  name: string;
  size?: number;
  duration_ms?: number;
  progress?: number;
  status?: string;
  startedAt?: number;
  lastOutTimeMs?: number;
  lastEventAt?: number;
  eta_ms?: number;
  outputPath?: string;
  newSize?: number;
  speedSamples?: number[];
}
