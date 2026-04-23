export interface EnvironmentCredentials {
  environmentId: string;
  managementApiKey: string;
  name: string;
}

export interface AppConfig {
  userEmail?: string;
}

export type MigrationMethod = 'codenames' | 'byType' | 'all';

export type StepId = 'setup' | 'select' | 'preview' | 'migrate' | 'results';

export interface ContentType {
  codename: string;
  name: string;
}

export interface Language {
  codename: string;
  name: string;
}

export interface ItemPreview {
  codename: string;
  name: string;
  typeCodename: string;
  typeName?: string;
  existsInTarget: boolean;
  targetLastModified?: string;
  targetWorkflowStep?: string;
}

export interface MigrationSetup {
  sourceEnv: EnvironmentCredentials;
  targetEnv: EnvironmentCredentials;
  language: string;
}

export interface ItemSelection {
  method: MigrationMethod;
  codenames: string[];
  typeCodenames: string[];
  limit: number;
}

export type LogLevel = 'info' | 'success' | 'error' | 'warning';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
}

export interface MigrationProgress {
  total: number;
  completed: number;
  failed: number;
  currentItem?: string;
  log: LogEntry[];
  done: boolean;
}

export interface MigrationResult {
  succeeded: string[];
  failed: Array<{ codename: string; error: string }>;
  durationMs: number;
}
