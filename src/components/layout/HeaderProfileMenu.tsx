import { ChevronDown, LogOut, Monitor, Moon, Settings2, Sun } from "lucide-react";
import { useState } from "react";
import { useIntl } from "react-intl";
import { useAuth } from "../../auth/useAuth";
import { useTheme } from "../../hooks/useTheme";
import { LOCALE_LABELS, SUPPORTED_LOCALES, useI18n } from "../../i18n";
import type { SupportedLocale } from "../../i18n";
import { useRouter } from "../../router";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/ui/user-avatar";

export function HeaderProfileMenu() {
  const intl = useIntl();
  const { user, logout } = useAuth();
  const { navigate } = useRouter();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const displayName = user.full_name || user.email || "Profile";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 rounded-lg px-1.5 hover:bg-muted"
          aria-label={displayName}
        >
          <UserAvatar />
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={displayName} className="rounded-xl p-2">
        <p className="px-3 py-2 text-sm text-muted-foreground">{user.email}</p>
        <Separator className="-mx-1 my-1 w-auto" />
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
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full justify-start gap-2 rounded-lg px-3 py-2 font-normal"
          onClick={() => {
            setOpen(false);
            navigate("/app/settings");
          }}
        >
          <Settings2 className="size-4" aria-hidden="true" />
          {intl.formatMessage({ id: "navigation.settings" })}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full justify-start gap-2 rounded-lg px-3 py-2 font-normal"
          onClick={() => {
            setOpen(false);
            logout();
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          {intl.formatMessage({ id: "auth.logout" })}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
