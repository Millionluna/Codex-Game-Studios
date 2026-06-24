import {
  ArrowRightLeft,
  BadgeCheck,
  ClipboardList,
  Send,
  UploadCloud,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, FieldLabel, SelectInput, TextArea, TextInput } from "@/components/ui";
import {
  getOnboardingTracks,
  summarizeParticipantCapabilities,
} from "@/lib/onboarding-tracks";

const capabilityLabels = [
  {
    key: "send",
    label: "可发 referral",
    activeText: "可以录入、发布和跟进 referral",
    inactiveText: "不作为 referral 来源方",
  },
  {
    key: "receive",
    label: "可接 referral",
    activeText: "可以接收匹配机会并更新状态",
    inactiveText: "不作为接单服务商",
  },
];

export default function ProviderOnboardingPage() {
  const tracks = getOnboardingTracks();

  return (
    <AppShell>
      <PageHeader
        eyebrow="网络成员入驻"
        title="先区分谁发 referral，谁接 referral"
        description="Careslink AI 的入驻对象不只有服务商。MVP 需要把 referral source、service provider 和两边都做的机构分清楚，后续审核、权限、匹配和分成才不会混在一起。"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {tracks.map((track) => (
          <Card
            key={track.role}
            className={`p-4 ${
              track.role === "service_provider"
                ? "border-[#9ed8c9] bg-[#f3fbf8]"
                : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
                  {track.shortLabel}
                </p>
                <h2 className="mt-2 text-lg font-semibold">{track.label}</h2>
              </div>
              <span className="rounded-md border border-[#cfded8] bg-white px-2 py-1 text-xs font-semibold text-[#40504b]">
                {summarizeParticipantCapabilities(track.role)}
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-[#40504b]">
              {track.description}
            </p>

            <div className="mt-4 grid gap-2 text-sm">
              {capabilityLabels.map((item) => {
                const active =
                  item.key === "send"
                    ? track.canSendReferrals
                    : track.canReceiveReferrals;

                return (
                  <div
                    key={item.key}
                    className={`rounded-lg border px-3 py-2 ${
                      active
                        ? "border-[#9ed8c9] bg-white text-[#0f766e]"
                        : "border-[#e5eee9] bg-[#f7faf8] text-[#66736f]"
                    }`}
                  >
                    <p className="font-semibold">{item.label}</p>
                    <p className="mt-1 text-xs leading-5">
                      {active ? item.activeText : item.inactiveText}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66736f]">
                审核重点
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {track.reviewFocus.map((item) => (
                  <span
                    key={item}
                    className="rounded-md bg-white px-2 py-1 text-xs font-medium text-[#40504b]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card className="p-5">
          <div className="mb-5 flex items-center gap-2">
            <ClipboardList className="size-5 text-[#0f766e]" aria-hidden="true" />
            <h2 className="text-lg font-semibold">入驻信息表单</h2>
          </div>

          <form className="grid gap-6">
            <section>
              <h3 className="text-sm font-semibold text-[#17211f]">1. 基础身份</h3>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <FieldLabel>
                  入驻类型
                  <SelectInput defaultValue="service_provider">
                    {tracks.map((track) => (
                      <option key={track.role} value={track.role}>
                        {track.label}
                      </option>
                    ))}
                  </SelectInput>
                </FieldLabel>
                <FieldLabel>
                  机构 / 服务商名称
                  <TextInput defaultValue="Harbour Community Support" />
                </FieldLabel>
                <FieldLabel>
                  联系人
                  <TextInput defaultValue="Harbour Intake 团队" />
                </FieldLabel>
                <FieldLabel>
                  联系方式
                  <TextInput defaultValue="hello@harbour.example / 02 9000 1000" />
                </FieldLabel>
              </div>
            </section>

            <section className="rounded-lg border border-[#dce8e2] bg-[#f7faf8] p-4">
              <h3 className="text-sm font-semibold text-[#17211f]">
                2. 如果你发 referral
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#5d6d68]">
                这部分用于 referral source：记录真实需求从哪里来、常见需求类型，以及由谁负责后续跟进。
              </p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <FieldLabel>
                  常见 referral 类型
                  <TextInput defaultValue="支持协调、OT 评估、居家护理" />
                </FieldLabel>
                <FieldLabel>
                  常见服务区域
                  <TextInput defaultValue="悉尼、帕拉马塔、好市围" />
                </FieldLabel>
                <FieldLabel>
                  来源渠道 / 群
                  <TextInput defaultValue="悉尼养老 Referral 资源群" />
                </FieldLabel>
                <FieldLabel>
                  来源审核说明
                  <TextInput defaultValue="有真实 participant / 家属 / coordinator 需求来源" />
                </FieldLabel>
              </div>
            </section>

            <section className="rounded-lg border border-[#dce8e2] bg-white p-4">
              <h3 className="text-sm font-semibold text-[#17211f]">
                3. 如果你接 referral
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#5d6d68]">
                这部分用于 service provider：用于匹配、审核、分享卡片和服务商 profile。
              </p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <FieldLabel>
                  ABN
                  <TextInput defaultValue="12 345 678 901" />
                </FieldLabel>
                <FieldLabel>
                  服务类型
                  <TextInput defaultValue="支持协调、个人护理" />
                </FieldLabel>
                <FieldLabel>
                  服务区域
                  <TextInput defaultValue="悉尼、帕拉马塔、车士活" />
                </FieldLabel>
                <FieldLabel>
                  服务语言
                  <TextInput defaultValue="英语、普通话、粤语" />
                </FieldLabel>
                <FieldLabel>
                  是否接新客户
                  <SelectInput defaultValue="yes">
                    <option value="yes">是</option>
                    <option value="limited">名额有限</option>
                    <option value="no">否</option>
                  </SelectInput>
                </FieldLabel>
                <FieldLabel>
                  支持资金类型
                  <SelectInput defaultValue="both">
                    <option value="both">NDIS 和养老护理</option>
                    <option value="ndis">仅 NDIS</option>
                    <option value="aged-care">仅养老护理</option>
                    <option value="private">仅自费</option>
                  </SelectInput>
                </FieldLabel>
              </div>
              <div className="mt-4 grid gap-4">
                <FieldLabel>
                  资质和保险说明
                  <TextArea defaultValue="注册 NDIS 服务商，配有双语支持协调员和已投保护理人员。" />
                </FieldLabel>
                <FieldLabel>
                  服务商简短介绍
                  <TextArea defaultValue="双语 care coordination 团队，帮助大悉尼家庭处理 NDIS 和养老护理 referral。" />
                </FieldLabel>
              </div>
            </section>

            <div className="flex flex-wrap gap-3">
              <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0f766e] px-4 text-sm font-semibold text-white">
                <Send className="size-4" /> 提交审核
              </button>
              <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#cfded8] bg-white px-4 text-sm font-semibold text-[#263834]">
                <UploadCloud className="size-4" /> 上传资质 / 保险文件
              </button>
            </div>
          </form>
        </Card>

        <div className="grid gap-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ArrowRightLeft className="size-5 text-[#19518d]" /> 权限怎么分
            </h2>
            <div className="mt-4 grid gap-3 text-sm leading-6 text-[#40504b]">
              <p>
                <strong>Referral source：</strong>可以创建 referral、查看自己来源的跟进状态、补充备注，不直接接单。
              </p>
              <p>
                <strong>Service provider：</strong>只能看到匹配给自己或已分配给自己的机会，更新 contacted / accepted / unable to serve 等状态。
              </p>
              <p>
                <strong>Both：</strong>同时拥有两个工作流，但需要业务合伙人审核利益冲突和归因规则。
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <BadgeCheck className="size-5 text-[#0f766e]" /> 已记录来源数据
            </h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-[#66736f]">业务合伙人</dt>
                <dd className="font-medium">悉尼养老 Referral 资源群</dd>
              </div>
              <div>
                <dt className="text-[#66736f]">来源微信群</dt>
                <dd className="font-medium">NSW 华人 NDIS 服务商群</dd>
              </div>
              <div>
                <dt className="text-[#66736f]">邀请链接</dt>
                <dd className="font-mono text-xs">invite-001</dd>
              </div>
              <div>
                <dt className="text-[#66736f]">保存到</dt>
                <dd className="font-medium">
                  network_participants / referral_sources / providers
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
