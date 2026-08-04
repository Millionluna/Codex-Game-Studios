import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import {
  getLocaleFromSearchParams,
  withLocale,
  type Locale,
} from "@/lib/referral-workspace-i18n";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "Privacy, collection and retention | CaresLink AI",
  description:
    "How CaresLink AI handles account information, reviewed document facts, saved drafts and metadata.",
};

export default async function PrivacyNoticePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getPrivacyCopy(locale);

  return (
    <AppShell locale={locale} languageSwitcherHref="/privacy">
      <article className="document-paper mx-auto max-w-5xl overflow-hidden">
        <header className="border-b border-line px-5 py-7 sm:px-8 sm:py-10">
          <p className="micro-label text-brand">{copy.kicker}</p>
          <h1 className="document-title mt-3 max-w-4xl">{copy.title}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted">
            {copy.intro}
          </p>
          <p className="mt-3 text-xs font-semibold text-muted">
            {copy.updated}
          </p>
        </header>

        <div className="grid gap-0 divide-y divide-line">
          {copy.sections.map((section) => (
            <section key={section.title} className="px-5 py-6 sm:px-8">
              <h2 className="text-xl font-semibold text-foreground">
                {section.title}
              </h2>
              <div className="document-prose mt-3 grid gap-3 text-sm leading-7 text-muted">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="flex flex-col gap-3 border-t border-line bg-[#f4f6f2] px-5 py-5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="max-w-2xl leading-6 text-muted">{copy.contact}</p>
          <div className="flex flex-wrap gap-4 font-semibold text-brand">
            <a
              href="https://careslink.com.au"
              rel="noreferrer"
              className="hover:underline"
            >
              {copy.contactLink}
            </a>
            <Link
              href={withLocale("/template-companion/ndis-case-note", locale)}
              className="hover:underline"
            >
              {copy.backToCompanion}
            </Link>
          </div>
        </footer>
      </article>
    </AppShell>
  );
}

function getPrivacyCopy(locale: Locale) {
  if (locale === "zh-Hans") {
    return {
      kicker: "CaresLink AI 数据说明",
      title: "隐私、信息收集与保留说明",
      intro:
        "本说明概述 CaresLink AI 在文档草稿流程中处理哪些信息、保留多久，以及用户可执行的控制。它是产品说明，不是法律保证。",
      updated: "最后更新：2026 年 8 月 4 日",
      sections: [
        {
          title: "我们收集什么",
          paragraphs: [
            "注册和登录会处理账号所需信息，例如邮箱、认证身份和账号角色。Google 登录只有在相应认证服务可靠启用时才显示。",
            "NDIS Case Note Companion 只应接收你已确认的最小结构化事实。粘贴模式中的原始工作文本在确认前只保留于当前浏览器 React 内存，不写入 URL、本地存储、分析事件或管理员页面。",
          ],
        },
        {
          title: "AI 处理",
          paragraphs: [
            "完成浏览器隐私复核与两项确认后，服务端仍会独立检查输入。只有通过检查的结构化事实才会发送给 OpenAI 生成受控格式草稿。",
            "OpenAI 请求使用 store:false。我们不把这一设置描述为 zero data retention；服务提供方仍可能按其适用条款和安全流程处理请求。",
          ],
        },
        {
          title: "临时结果与已保存文档",
          paragraphs: [
            "成功结果通过与当前账号绑定的不透明 claim 暂存，默认有效期为 30 分钟，用于幂等恢复和保存流程。",
            "用户选择保存后，文档会保留，直到该用户主动删除。已保存内容按账号 owner 边界读取；用户应把需要成为正式记录的内容转入其获授权的记录系统。",
          ],
        },
        {
          title: "使用量与产品分析",
          paragraphs: [
            "产品事件仅记录 metadata，例如事件名称、哈希标识、允许的来源维度、语言、时间、credits reserve/commit/release 状态和模型 token 计数。",
            "Telemetry 和管理员聚合视图不应包含输入、输出、participant facts、原始粘贴文本或自由文本错误。",
          ],
        },
        {
          title: "删除、联系与使用边界",
          paragraphs: [
            "用户可以在 Saved Documents 中删除自己保存的草稿。若需要提出账号或数据问题，请使用 CaresLink 网站公布的联系渠道。",
            "所有输出都是待用户复核的草稿，不是完成的正式记录，也不构成临床、法律、照护、监管、合规或其他专业建议。",
          ],
        },
      ],
      contact:
        "自动隐私检查只能识别部分明显线索，不能保证完全去标识化。提交前仍需由用户人工复核。",
      contactLink: "CaresLink 联系渠道",
      backToCompanion: "返回 Case Note Companion",
    };
  }

  return {
    kicker: "CaresLink AI data notice",
    title: "Privacy, collection and retention notice",
    intro:
      "This notice explains what CaresLink AI handles during document drafting, how long it is retained and the controls available to users. It is a product notice, not a legal guarantee.",
    updated: "Last updated: 4 August 2026",
    sections: [
      {
        title: "What we collect",
        paragraphs: [
          "Registration and sign-in handle account information such as email, authentication identity and account role. Google sign-in is shown only when the related authentication service is reliably enabled.",
          "The NDIS Case Note Companion should receive only the minimum structured facts you confirm. Before confirmation, original paste-mode working text remains in current-browser React memory and is not placed in URLs, local storage, analytics events or admin pages.",
        ],
      },
      {
        title: "AI processing",
        paragraphs: [
          "After browser privacy review and both confirmations, the server independently validates the input. Only reviewed structured facts that pass those checks are sent to OpenAI for a controlled-format draft.",
          "OpenAI requests use store:false. We do not describe that setting as zero data retention; the service provider may still process requests under its applicable terms and security processes.",
        ],
      },
      {
        title: "Temporary results and saved documents",
        paragraphs: [
          "A successful result is held under an opaque, account-bound claim for 30 minutes by default to support idempotent recovery and saving.",
          "When a user saves a document, it remains until that user deletes it. Saved content is read within the account-owner boundary. Material that must become an official record should be transferred to the user's authorised record system.",
        ],
      },
      {
        title: "Usage and product analytics",
        paragraphs: [
          "Product events contain metadata such as event name, hashed identifiers, allowlisted attribution, language, timestamps, credit reserve/commit/release status and model token counts.",
          "Telemetry and aggregate admin views should not contain input, output, participant facts, original pasted text or free-text errors.",
        ],
      },
      {
        title: "Deletion, contact and use boundary",
        paragraphs: [
          "Users can delete their own saved drafts in Saved Documents. For account or data questions, use the contact channel published on the CaresLink website.",
          "Every output is a user-reviewed draft, not a completed official record, and is not clinical, legal, care, regulatory, compliance or other professional advice.",
        ],
      },
    ],
    contact:
      "Automated privacy checks catch only some obvious clues and cannot guarantee complete de-identification. The user must review every submission.",
    contactLink: "CaresLink contact channel",
    backToCompanion: "Back to Case Note Companion",
  };
}
