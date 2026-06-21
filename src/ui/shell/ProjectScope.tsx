import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import { useTranslation } from "@/i18n";
import { useProjectStore } from "@/store";
import { NoProject } from "@/pages/NoProject";

/**
 * 包裹 /p/:projectId/* 路由：加载项目列表、校验路由项目存在性、
 * 把当前路由项目同步为活动项目；项目不存在时显示「无项目」提示。
 */
export function ProjectScope() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const { projects, loaded, activeProjectId, load, setActive } =
    useProjectStore();

  useEffect(() => {
    if (!loaded) {
      void load();
    }
  }, [loaded, load]);

  const project = projectId
    ? projects.find((item) => item.id === projectId)
    : undefined;

  useEffect(() => {
    if (project && activeProjectId !== project.id) {
      void setActive(project.id);
    }
  }, [project, activeProjectId, setActive]);

  if (!loaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <span
          className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"
          aria-label={t("reader.loading")}
        />
      </main>
    );
  }

  if (!project) {
    return <NoProject />;
  }

  return <Outlet />;
}
