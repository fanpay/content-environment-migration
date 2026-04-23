import { getCustomAppContext } from '@kontent-ai/custom-app-sdk';
import type { AppConfig } from '../types';

export async function loadAppConfig(): Promise<AppConfig> {
  try {
    const sdkContext = await getCustomAppContext();
    if (!sdkContext.isError && sdkContext.context) {
      return { userEmail: sdkContext.context.userEmail };
    }
  } catch {
    // Not running inside Kontent.ai
  }
  return {};
}
