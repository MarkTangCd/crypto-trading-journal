import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { fromSavedSkillIds, toSavedSkillIds } from "./skillsSelection";

export function SkillsSection() {
  const utils = trpc.useUtils();
  const skillsQuery = trpc.settings.listSkills.useQuery();
  const enabledQuery = trpc.settings.getEnabledSkillIds.useQuery();

  const [draft, setDraft] = useState<Set<string> | null>(null);

  const setMutation = trpc.settings.setEnabledSkillIds.useMutation({
    onSuccess: () => {
      toast.success("已保存 skills 启用列表");
      utils.settings.getEnabledSkillIds.invalidate();
      setDraft(null);
    },
    onError: error => {
      toast.error(error.message || "保存失败");
    },
  });

  // Allow the queries to refresh independently; the join is cheap and lets
  // us bail out of rendering until both are hydrated.
  const isLoading = skillsQuery.isLoading || enabledQuery.isLoading;

  const allIds = useMemo(
    () => (skillsQuery.data ?? []).map(s => s.name),
    [skillsQuery.data]
  );

  const serverChecked = useMemo(
    () => fromSavedSkillIds(allIds, enabledQuery.data?.enabledSkillIds ?? []),
    [allIds, enabledQuery.data?.enabledSkillIds]
  );

  // The draft mirrors the server set until the user toggles something; on
  // save we collapse "all checked" back to the [] sentinel server-side.
  const checked = draft ?? serverChecked;

  const toggle = (id: string) => {
    setDraft(prev => {
      const next = new Set(prev ?? serverChecked);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isDirty = useMemo(() => {
    if (draft === null) return false;
    if (draft.size !== serverChecked.size) return true;
    for (const id of draft) if (!serverChecked.has(id)) return true;
    return false;
  }, [draft, serverChecked]);

  const handleSave = () => {
    if (checked.size === 0) {
      // [] is the server's "all enabled" sentinel, so saving an empty draft
      // would silently re-enable everything on the next page load. We guard
      // here in addition to disabling the button so a keyboard submit can't
      // sneak past.
      toast.error("至少保留一个 skill；如想全启用，请勾选全部后保存");
      return;
    }
    setMutation.mutate({
      enabledSkillIds: toSavedSkillIds(allIds, checked),
    });
  };

  if (isLoading) {
    return (
      <section className="border-y border-border py-5">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  const skills = skillsQuery.data ?? [];

  if (skills.length === 0) {
    return (
      <section className="border-y border-border py-5 space-y-1">
        <p className="font-medium text-foreground">skills</p>
        <p className="text-sm text-muted-foreground">暂无已注册 skill。</p>
      </section>
    );
  }

  const canSave = isDirty && !setMutation.isPending && checked.size > 0;

  return (
    <section className="border-y border-border py-5 space-y-5">
      <div className="space-y-1">
        <p className="font-medium text-foreground">skills</p>
        <p className="text-sm text-muted-foreground">
          勾选 review agent 可调用的 skill。默认全启用——取消勾选某项后，agent
          不会再调用它。
        </p>
      </div>

      <div className="space-y-3">
        {skills.map(skill => {
          const inputId = `skill-${skill.name}`;
          const isChecked = checked.has(skill.name);
          return (
            <label
              key={skill.name}
              htmlFor={inputId}
              className="flex items-start gap-3 cursor-pointer"
            >
              <input
                id={inputId}
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(skill.name)}
                className="mt-1 size-4 accent-foreground"
              />
              <div className="flex-1 space-y-0.5">
                <div className="flex items-baseline gap-3">
                  <span className="font-medium text-foreground">
                    {skill.name}
                  </span>
                  {skill.category ? (
                    <span className="text-label text-muted-foreground">
                      {skill.category}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {skill.description}
                </p>
              </div>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-3">
        <span
          className={cn(
            "text-label",
            isDirty ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {isDirty ? "未保存改动" : "无改动"}
        </span>
        <Button type="button" disabled={!canSave} onClick={handleSave}>
          {setMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "保存"
          )}
        </Button>
      </div>
    </section>
  );
}
