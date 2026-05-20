import { redirectAuthenticatedUser } from "@/server/auth";
import { LoginClient } from "./login-client";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  await redirectAuthenticatedUser();
  const params = await searchParams;
  const nextParam = params?.next;
  const errorParam = params?.error;
  const nextPath = typeof nextParam === "string" && nextParam.startsWith("/") ? nextParam : "/";
  const authError = typeof errorParam === "string" ? errorParam : null;

  return <LoginClient authError={authError} nextPath={nextPath} />;
}
