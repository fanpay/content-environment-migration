import type { StepId } from '../types';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'setup', label: 'Setup' },
  { id: 'select', label: 'Select Items' },
  { id: 'preview', label: 'Preview' },
  { id: 'migrate', label: 'Migrate' },
  { id: 'results', label: 'Results' },
];

const STEP_ORDER: StepId[] = ['setup', 'select', 'preview', 'migrate', 'results'];

interface Props {
  current: StepId;
}

export function StepIndicator({ current }: Props) {
  const currentIndex = STEP_ORDER.indexOf(current);

  return (
    <div className="flex items-start gap-0 mb-8">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isActive = i === currentIndex;

        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center min-w-[2rem]">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                  isCompleted
                    ? 'bg-kontent-primary border-kontent-primary text-white'
                    : isActive
                      ? 'bg-white border-kontent-primary text-kontent-primary'
                      : 'bg-white border-gray-200 text-gray-400'
                }`}
              >
                {isCompleted ? '✓' : i + 1}
              </div>
              <span
                className={`mt-1 text-xs font-medium whitespace-nowrap ${
                  isActive
                    ? 'text-kontent-primary'
                    : isCompleted
                      ? 'text-gray-700'
                      : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 mb-5 ${i < currentIndex ? 'bg-kontent-primary' : 'bg-gray-200'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
