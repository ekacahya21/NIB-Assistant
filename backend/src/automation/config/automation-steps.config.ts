export enum AutomationSubStep {
  LOGIN = 'LOGIN',
  LOCATION = 'LOCATION',
  KBLI = 'KBLI',
  TATA_RUANG = 'TATA_RUANG',
  INVESTASI = 'INVESTASI',
  PARAMETER = 'PARAMETER',
  LINGKUNGAN = 'LINGKUNGAN',
  AMDALNET = 'AMDALNET',
  NIB = 'NIB',
}

export interface StepMetadata {
  order: number;
  label: string;
  stepNumber: number;
  requiredIds: string[];
}

export const STEP_REGISTRY: Record<AutomationSubStep, StepMetadata> = {
  [AutomationSubStep.LOGIN]: {
    order: 0,
    label: 'Login OSS',
    stepNumber: 4,
    requiredIds: [],
  },
  [AutomationSubStep.LOCATION]: {
    order: 1,
    label: 'Kelola Lokasi Usaha',
    stepNumber: 5,
    requiredIds: [],
  },
  [AutomationSubStep.KBLI]: {
    order: 2,
    label: 'Bidang Usaha (KBLI)',
    stepNumber: 6,
    requiredIds: ['id_proyek_lokasi'],
  },
  [AutomationSubStep.TATA_RUANG]: {
    order: 3,
    label: 'Pernyataan Tata Ruang',
    stepNumber: 6,
    requiredIds: ['id_proyek_lokasi', 'id_proyek'],
  },
  [AutomationSubStep.INVESTASI]: {
    order: 4,
    label: 'Data Investasi & Produk',
    stepNumber: 6,
    requiredIds: ['id_proyek'],
  },
  [AutomationSubStep.PARAMETER]: {
    order: 5,
    label: 'Parameter Risiko',
    stepNumber: 6,
    requiredIds: ['id_proyek'],
  },
  [AutomationSubStep.LINGKUNGAN]: {
    order: 6,
    label: 'Persetujuan Lingkungan',
    stepNumber: 6,
    requiredIds: ['id_proyek'],
  },
  [AutomationSubStep.AMDALNET]: {
    order: 7,
    label: 'Penapisan AMDALnet',
    stepNumber: 6,
    requiredIds: ['id_proyek'],
  },
  [AutomationSubStep.NIB]: {
    order: 8,
    label: 'Penerbitan NIB',
    stepNumber: 7,
    requiredIds: ['id_proyek'],
  },
};

export const ORDERED_STEPS: AutomationSubStep[] = [
  AutomationSubStep.LOGIN,
  AutomationSubStep.LOCATION,
  AutomationSubStep.KBLI,
  AutomationSubStep.TATA_RUANG,
  AutomationSubStep.INVESTASI,
  AutomationSubStep.PARAMETER,
  AutomationSubStep.LINGKUNGAN,
  AutomationSubStep.AMDALNET,
  AutomationSubStep.NIB,
];

export function getNextSubStep(
  lastStep: string | null | undefined,
): AutomationSubStep {
  if (!lastStep) return AutomationSubStep.LOCATION;

  const currentIndex = ORDERED_STEPS.indexOf(lastStep as AutomationSubStep);
  if (currentIndex === -1 || currentIndex >= ORDERED_STEPS.length - 1) {
    return AutomationSubStep.LOCATION;
  }
  return ORDERED_STEPS[currentIndex + 1];
}

export function isStepCompleted(
  stepToCheck: AutomationSubStep,
  targetResumeStep: AutomationSubStep,
): boolean {
  const checkOrder = STEP_REGISTRY[stepToCheck]?.order ?? 0;
  const targetOrder = STEP_REGISTRY[targetResumeStep]?.order ?? 0;
  return checkOrder < targetOrder;
}

export function buildStepDeeplink(
  step: AutomationSubStep,
  checkpointData: Record<string, string> | null | undefined,
  baseUrl: string = process.env.OSS_BERANDA_URL ||
    'https://beranda-stg.oss.go.id',
): string | null {
  if (!checkpointData) return null;

  switch (step) {
    case AutomationSubStep.KBLI:
      if (!checkpointData.id_proyek_lokasi) return null;
      return `${baseUrl}/persyaratan-dasar-tata-ruang?id_proyek_lokasi=${checkpointData.id_proyek_lokasi}`;

    case AutomationSubStep.TATA_RUANG:
      if (!checkpointData.id_proyek_lokasi || !checkpointData.id_proyek) {
        return null;
      }
      return `${baseUrl}/persyaratan-dasar-tata-ruang?id_proyek_lokasi=${checkpointData.id_proyek_lokasi}&id_proyek=${checkpointData.id_proyek}&is_from_detail_usaha=true`;

    case AutomationSubStep.INVESTASI:
    case AutomationSubStep.PARAMETER:
    case AutomationSubStep.LINGKUNGAN:
    case AutomationSubStep.AMDALNET:
    case AutomationSubStep.NIB:
      if (!checkpointData.id_proyek) return null;
      return `${baseUrl}/data-kegiatan-usaha?id_proyek=${checkpointData.id_proyek}`;

    default:
      return null;
  }
}

export function hasRequiredDataForNextStep(
  completedStep: AutomationSubStep,
  checkpointData: Record<string, string> | null | undefined,
): { valid: boolean; missingIds: string[]; nextStep: AutomationSubStep } {
  const nextStep = getNextSubStep(completedStep);

  // If completed step is NIB, there is no next step deeplink required
  if (completedStep === AutomationSubStep.NIB) {
    return { valid: true, missingIds: [], nextStep };
  }

  const requiredIds = STEP_REGISTRY[nextStep]?.requiredIds || [];
  const missingIds = requiredIds.filter(
    (id) => !checkpointData || !checkpointData[id],
  );

  return {
    valid: missingIds.length === 0,
    missingIds,
    nextStep,
  };
}
