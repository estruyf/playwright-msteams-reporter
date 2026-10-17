export interface EnvSignalCaptureOptions {
  annotationPrefix?: string;
  includeHosts?: string[];
  excludeHosts?: string[];
  excludeUrls?: string[];
  ignoredHttpStatuses?: number[];
  maxEvents?: number;
  maxEventsPerKind?: number;
  maxDescriptionLength?: number;
  retainOnPass?: boolean;
  classifiers?: EnvSignalClassifier[];
  sanitizeText?: (text: string) => string;
}

export interface EnvSignalCaptureEvent {
  source: "page-error" | "console-error" | "response" | "request-failed" | "manual" | "timeout";
  url?: string;
  status?: number;
  method?: string;
  resourceType?: string;
  text?: string;
}

export interface EnvSignalClassification {
  kind: string;
  description?: string;
}

export interface EnvSignalRecord extends EnvSignalClassification {
  url?: string;
}

export type EnvSignalClassifier = (event: EnvSignalCaptureEvent) => EnvSignalClassification | undefined;

export interface NormalizedEnvSignalCaptureOptions {
  annotationPrefix: string;
  includeHosts: string[];
  excludeHosts: string[];
  excludeUrls: string[];
  ignoredHttpStatuses: number[];
  maxEvents: number;
  maxEventsPerKind: number;
  maxDescriptionLength: number;
  retainOnPass: boolean;
  classifiers: EnvSignalClassifier[];
  sanitizeText: ((text: string) => string) | undefined;
}