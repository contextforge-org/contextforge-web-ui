import { ChevronDown, LogOut, Monitor, Moon, Settings2, Sun } from "lucide-react";
import { useIntl } from "react-intl";
import { useAuth } from "../../auth/useAuth";
import { useTheme } from "../../hooks/useTheme";
import { LOCALE_LABELS, SUPPORTED_LOCALES, useI18n } from "../../i18n";
import type { SupportedLocale } from "../../i18n";
import { useRouter } from "../../router";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export function HeaderProfileMenu() {
  const intl = useIntl();
  const { user, logout } = useAuth();
  const { navigate } = useRouter();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useI18n();

  if (!user) return null;

  const displayName = user.full_name || user.email || "Profile";

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 rounded-lg px-1.5 hover:bg-muted"
          aria-label={displayName}
        >
          <UserAvatar />
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-xl p-2">
        <DropdownMenuLabel className="px-3 py-2 text-sm font-normal text-muted-foreground">
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="text-sm">{intl.formatMessage({ id: "common.theme" })}</span>
          <div className="flex items-center gap-1 rounded-full bg-muted p-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setTheme("light")}
              className={`rounded-full transition-colors ${theme === "light" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              aria-label={intl.formatMessage({ id: "common.theme.light" })}
            >
              <Sun className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setTheme("dark")}
              className={`rounded-full transition-colors ${theme === "dark" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              aria-label={intl.formatMessage({ id: "common.theme.dark" })}
            >
              <Moon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setTheme("system")}
              className={`rounded-full transition-colors ${theme === "system" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              aria-label={intl.formatMessage({ id: "common.theme.system" })}
            >
              <Monitor className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="text-sm">{intl.formatMessage({ id: "common.language" })}</span>
          <Select value={locale} onValueChange={(value) => setLocale(value as SupportedLocale)}>
            <SelectTrigger
              size="sm"
              aria-label={intl.formatMessage({ id: "common.language" })}
              className="h-auto gap-1.5 border-0 bg-transparent px-2 py-1 text-xs font-medium text-secondary-foreground shadow-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" side="bottom" align="end" sideOffset={4}>
              {SUPPORTED_LOCALES.map((supported) => (
                <SelectItem key={supported} value={supported}>
                  {LOCALE_LABELS[supported]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DropdownMenuItem
          onClick={() => navigate("/app/settings")}
          className="gap-2 rounded-lg px-3 py-2"
        >
          <Settings2 className="size-4" aria-hidden="true" />
          {intl.formatMessage({ id: "navigation.settings" })}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={logout} className="gap-2 rounded-lg px-3 py-2">
          <LogOut className="size-4" aria-hidden="true" />
          {intl.formatMessage({ id: "auth.logout" })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
