import { Subject } from 'rxjs';
import { AutomationEvent } from '../automation.service';

export interface AutomationSessionContext {
  page: any;
  draft: any;
  subject: Subject<AutomationEvent>;
  akunOss: 'belum' | 'sudah';
  txId: string;
  jwtToken?: string;
  refreshToken?: string;
  logStep: (
    step: number,
    status: 'info' | 'success' | 'warn' | 'error',
    text: string,
    data?: any,
  ) => void;
  waitForOtp: () => Promise<string>;
  waitForPassword: () => Promise<string>;
  waitForProductInput: () => Promise<any>;
  waitForParameterInput: () => Promise<string>;
}
