import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-950">
      <SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/dashboard" signUpUrl="/sign-up" />
    </div>
  );
}
