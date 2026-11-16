import type { BuiltSite } from "#db/built-sites/types.ts";
import { t } from "#i18n";
import { Raw } from "#jsx/jsx-runtime.ts";
import {
  hostInfraSecretNames,
  type SiteSecretsView,
} from "#shared/site-secrets.ts";
import type { BuiltSiteUpdateState } from "#shared/site-update.ts";
import {
  ConfirmActionButton,
  SiteActionForm,
  TranslatedSubmitButton,
} from "#templates/admin/built-sites/action-forms.tsx";
import { SubmitButton } from "#templates/components/actions.tsx";
import type { ChildProps } from "#templates/components/child-props.ts";
import { ErrorNote } from "#templates/components/error.tsx";
import { Prose } from "#templates/components/prose-heading.tsx";
import { ProsePanel } from "#templates/components/prose-panel.tsx";

const CodeNameList = ({ names }: { names: string[] }): JSX.Element => (
  <ul>
    {names.map((name) => (
      <li>
        <code>{name}</code>
      </li>
    ))}
  </ul>
);

/** A tab whose whole body is its read failure: the error note alone in a
 * prose block. */
export const TabErrorNote = ({ children }: ChildProps): JSX.Element => (
  <Prose>
    <ErrorNote>{children}</ErrorNote>
  </Prose>
);

export const MaintenancePanel = ({
  site,
}: {
  site: BuiltSite;
}): JSX.Element => (
  <div class="prose">
    <p>{t("built_sites.maintenance_intro")}</p>
    {site.scheduledTaskKey && (
      <p>
        <strong>{t("built_sites.maintenance_site_key")}</strong>{" "}
        <code>{site.scheduledTaskKey}</code>
      </p>
    )}
    <SiteActionForm action="provision-scheduler" siteId={site.id}>
      <TranslatedSubmitButton
        icon="hammer"
        labelKey={
          site.scheduledTaskKey
            ? "built_sites.maintenance_resend"
            : "built_sites.maintenance_provision"
        }
      />
    </SiteActionForm>
  </div>
);

export const SecretsPanel = ({
  site,
  view,
}: {
  site: BuiltSite;
  view?: SiteSecretsView | undefined;
}): JSX.Element => {
  if (!view) return <p class="prose">{t("built_sites.secrets_unavailable")}</p>;
  if (!view.ok) {
    return (
      <TabErrorNote>
        {t("built_sites.secrets_error", { error: view.error })}
      </TabErrorNote>
    );
  }
  const infraMissing = hostInfraSecretNames(view.missing);
  return (
    <div class="prose">
      <p>
        <Raw
          html={t("built_sites.secrets_count", {
            expected: String(view.expected.length),
            present: String(view.present.length),
          })}
        />
      </p>
      {view.missing.length === 0 ? (
        <output class="success">{t("built_sites.all_secrets_present")}</output>
      ) : (
        <SiteActionForm action="add-secrets" siteId={site.id}>
          <p>{t("built_sites.missing_secrets")}</p>
          <CodeNameList names={view.missing} />
          {infraMissing.length > 0 && (
            <p role="note">
              <strong>{t("built_sites.infra_secrets_heading")}</strong>{" "}
              {t("built_sites.infra_secrets_note", {
                names: infraMissing.join(", "),
              })}
            </p>
          )}
          {view.pairConflicts.length > 0 && (
            <>
              <p role="note">
                <strong>{t("built_sites.pair_conflict_heading")}</strong>{" "}
                {t("built_sites.pair_conflict_note", {
                  names: view.pairConflicts.join(", "),
                })}
              </p>
              <label>
                <input
                  name="confirm_pair_secrets"
                  required
                  type="checkbox"
                  value="1"
                />{" "}
                {t("built_sites.pair_conflict_confirm")}
              </label>
            </>
          )}
          <SubmitButton icon="plus">
            {t("built_sites.set_missing_secrets", {
              count: String(view.missing.length),
            })}
          </SubmitButton>
        </SiteActionForm>
      )}
      {view.present.length > 0 && (
        <details>
          <summary>{t("built_sites.secrets_on_site")}</summary>
          <CodeNameList names={view.present} />
        </details>
      )}
    </div>
  );
};

export const UpdatePanel = ({
  site,
  state,
}: {
  site: BuiltSite;
  state: BuiltSiteUpdateState;
}): JSX.Element => (
  <ProsePanel
    label={t("built_sites.update_site_version_label")}
    value={
      state.siteVersionLabel ??
      (state.siteVersionError
        ? t("built_sites.update_version_error", {
            error: state.siteVersionError,
          })
        : t("built_sites.update_unknown_version"))
    }
  >
    <p>
      <strong>{t("built_sites.update_latest_label")}</strong>{" "}
      {state.latestVersion
        ? `${state.latestVersionName} (${state.latestVersion})`
        : t("built_sites.update_latest_none")}
    </p>
    {state.updateAvailable ? (
      <p>
        <strong>{t("built_sites.update_available")}</strong>
      </p>
    ) : state.upToDate ? (
      <output class="success">{t("built_sites.update_up_to_date")}</output>
    ) : null}
    {state.providerConfigured && state.hasHostingId ? (
      <ConfirmActionButton
        action="update"
        confirmKey="built_sites.update_confirm"
        icon="rotate-ccw"
        labelKey="built_sites.update_button"
        siteId={site.id}
      />
    ) : (
      <p>
        <em>{t("built_sites.update_unavailable")}</em>
      </p>
    )}
  </ProsePanel>
);
