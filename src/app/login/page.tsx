import { PRIVACY_URL, TERMS_URL } from "@/lib/platform";
import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; mode?: string }>;
}) {
  const { error, message, mode } = await searchParams;
  const isSignUp = mode === "signup";

  return (
    <main className="wash flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-3xl">{isSignUp ? "Create your account" : "Welcome back"}</h1>
        <p className="mb-6 text-sm text-muted">
          {isSignUp ? "Set up your coaching business in a few minutes." : "Sign in to your coaching business."}
        </p>

        {error && <p className="mb-4 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{error}</p>}
        {message && <p className="mb-4 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">{message}</p>}

        <form action={isSignUp ? signUp : signIn} className="card space-y-4">
          {isSignUp && (
            <div>
              <label className="label" htmlFor="display_name">Your name</label>
              <input className="input" id="display_name" name="display_name" required />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              className="input"
              id="password"
              name="password"
              type="password"
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              required
            />
          </div>
          {isSignUp && (
            <div className="space-y-2 rounded-xl bg-accent-soft/60 p-3 text-sm">
              <label className="flex items-start gap-2">
                <input type="checkbox" name="agree" required className="mt-1" />
                <span>
                  I agree to the {TERMS_URL ? <a href={TERMS_URL} target="_blank" className="text-accent underline">Terms of Service</a> : "Terms of Service"} and{" "}
                  {PRIVACY_URL ? <a href={PRIVACY_URL} target="_blank" className="text-accent underline">Privacy Policy</a> : "Privacy Policy"}.
                </span>
              </label>
              <p className="text-muted">
                Our support team can open your account to help you or fix problems. Every access is recorded with a reason, and ends automatically.{" "}
                {PRIVACY_URL ? (
                  <a href={PRIVACY_URL} target="_blank" className="text-accent underline">Read how we protect your information.</a>
                ) : (
                  "Read how we protect your information."
                )}
              </p>
            </div>
          )}
          <button className="btn w-full">{isSignUp ? "Create account" : "Sign in"}</button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          {isSignUp ? (
            <>Already have an account? <a className="text-accent underline" href="/login">Sign in</a></>
          ) : (
            <>New here? <a className="text-accent underline" href="/login?mode=signup">Create an account</a></>
          )}
        </p>
      </div>
    </main>
  );
}
