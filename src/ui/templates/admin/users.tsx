/**
 * Admin user management page template
 */

import { t } from "#i18n";
import { defineTable } from "#shared/tables/definition.ts";
import { errorAdminPage, flashOptsPage } from "#templates/admin/admin-page.tsx";
import { entityDeletePage } from "#templates/admin/confirm-page.tsx";
import { GuideFooter } from "#templates/components/actions.tsx";
import { linkCell } from "#templates/components/link-cell.tsx";
import { NewResourceForm } from "#templates/components/new-resource-form.tsx";
import { renderTable } from "#templates/components/table.tsx";
import { getInviteUserForm } from "#templates/fields/admin.ts";
import type { AdminLevel, AdminSession } from "#types";

/** Displayable user info (decrypted) */
export interface DisplayUser {
  /** True once the user has set a password via /join. For keyed roles this also
   * means they hold a data key; the keyless editor activates without one. */
  activated: boolean;
  adminLevel: AdminLevel;
  id: number;
  inviteExpired: boolean;
  username: string;
}

/** Status label for a user */
export const userStatus = (user: DisplayUser): string => {
  // An activated user has joined and set a password; otherwise they are an
  // outstanding invite, which is either still open or expired.
  if (user.activated) return t("users.status.active");
  if (user.inviteExpired) return t("users.status.expired");
  return t("users.status.invited");
};

const usersTable = defineTable<DisplayUser>([
  {
    cell: linkCell(
      (user: DisplayUser) => `/admin/users/${user.id}`,
      (user) => user.username,
    ),
    header: () => t("common.username"),
    key: "username",
  },
  {
    cell: (user) => user.adminLevel,
    header: () => t("users.col.role"),
    key: "role",
  },
  {
    cell: userStatus,
    header: () => t("common.status"),
    key: "status",
  },
]);

/**
 * Admin user management page
 */
export interface UsersPageOpts {
  currentUserId: number;
  error?: string | undefined;
  inviteLink: string;
  success?: string | undefined;
}

export const adminUsersPage = (
  users: DisplayUser[],
  session: AdminSession,
  opts: UsersPageOpts,
): string =>
  flashOptsPage(t("terms.users"), "/admin/users")(
    session,
    opts,
    <>
      {opts.inviteLink && (
        <div class="success" role="alert">
          <p>{t("users.invite_link_label")}</p>
          <code>{opts.inviteLink}</code>
          <p>
            <small>{t("users.invite_expires")}</small>
          </p>
        </div>
      )}

      {renderTable(usersTable, users)}

      <GuideFooter href="/admin/guide#user-classes">
        {t("users.roles_link")}
      </GuideFooter>
    </>,
  );

/**
 * Admin delete user confirmation page
 */
export const adminUserDeletePage = entityDeletePage((user: DisplayUser) => ({
  action: `/admin/users/${user.id}/delete`,
  active: "/admin/users",
  buttonText: t("users.delete_user.submit"),
  children: (
    <>
      <h1>{t("users.delete_user.heading")}</h1>
      <p>
        {t("users.delete_user.warning", {
          level: user.adminLevel,
          username: user.username,
        })}
      </p>
      <p>
        {t("users.delete_user.confirm_prompt", { username: user.username })}
      </p>
    </>
  ),
  label: t("common.username"),
  name: user.username,
  title: `${t("users.delete_user.heading")}: ${user.username}`,
}));

/**
 * Admin invite user page
 */
export const adminUserNewPage = (
  session: AdminSession,
  error?: string,
): string =>
  errorAdminPage(t("users.invite.title"), "/admin/user/new")(session, error)(
    <NewResourceForm
      action="/admin/users"
      fieldsHtml={getInviteUserForm().render()}
      submitIcon="user-plus"
      submitLabel={t("users.invite.submit")}
      title={t("users.invite.heading")}
    />,
  );
