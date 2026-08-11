import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-950">
      <SignUp routing="path" path="/sign-up" fallbackRedirectUrl="/dashboard" signInUrl="/sign-in" />
    </div>
  );
}
