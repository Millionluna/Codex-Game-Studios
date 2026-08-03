import Image from "next/image";
import { AuthSubmitButton } from "./auth-submit-button";

type GoogleOAuthFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  dividerLabel: string;
  label: string;
  locale: "en" | "zh-Hans";
  nextHref: string;
  pendingLabel: string;
};

export function GoogleOAuthForm({
  action,
  dividerLabel,
  label,
  locale,
  nextHref,
  pendingLabel,
}: GoogleOAuthFormProps) {
  return (
    <>
      <form action={action} className="mt-6">
        <input name="next" type="hidden" value={nextHref} />
        <input name="lang" type="hidden" value={locale} />
        <AuthSubmitButton
          pendingLabel={pendingLabel}
          className="taito-secondary w-full px-4"
        >
          <Image
            src="/google-g.svg"
            alt=""
            width={18}
            height={18}
            aria-hidden="true"
          />
          <span>{label}</span>
        </AuthSubmitButton>
      </form>
      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs font-semibold text-muted">{dividerLabel}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}
