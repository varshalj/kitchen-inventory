import Link from "next/link"
import { CookingPot } from "lucide-react"

export const metadata = {
  title: "Privacy Policy | Kitchen Inventory",
  description: "How Kitchen Inventory collects, uses, and protects your data.",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="container mx-auto px-4 max-w-3xl py-4 flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium hover:opacity-80 transition-opacity">
            <div className="rounded-full bg-primary/10 p-1">
              <CookingPot className="h-4 w-4 text-primary" />
            </div>
            Kitchen Inventory
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 max-w-3xl py-12">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm mb-10">Last updated: March 2026</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. What we collect</h2>
            <p className="text-muted-foreground leading-relaxed">
              When you use Kitchen Inventory, we collect only what is necessary to provide the service:
            </p>
            <ul className="mt-3 space-y-2 text-muted-foreground list-disc list-inside">
              <li><strong className="text-foreground">Email address</strong> — used solely for authentication (magic link sign-in or Google OAuth).</li>
              <li><strong className="text-foreground">Inventory data</strong> — the food items, quantities, expiry dates, and locations you enter.</li>
              <li><strong className="text-foreground">Shopping list</strong> — items you add to your shopping list.</li>
              <li><strong className="text-foreground">Recipes</strong> — recipes you import or save within the app.</li>
            </ul>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              We do not collect any financial information, device identifiers, or behavioural analytics.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. How we store your data</h2>
            <p className="text-muted-foreground leading-relaxed">
              All data is stored in <strong className="text-foreground">Supabase</strong>, a managed PostgreSQL database service. Data is encrypted at rest and in transit. Supabase's infrastructure is hosted on AWS and complies with SOC 2 Type II standards. You can review Supabase's own privacy policy at{" "}
              <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">supabase.com/privacy</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. How we use your data</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your data is used exclusively to provide the features of the app — displaying your inventory, generating meal plans, tracking expiry, and managing your shopping list. We do not:
            </p>
            <ul className="mt-3 space-y-2 text-muted-foreground list-disc list-inside">
              <li>Sell your data to any third party.</li>
              <li>Use your data for advertising.</li>
              <li>Share your data with anyone except the infrastructure providers listed above.</li>
              <li>Run any third-party analytics scripts on your account data.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Authentication providers</h2>
            <p className="text-muted-foreground leading-relaxed">
              Sign-in is handled by Supabase Auth, which supports:
            </p>
            <ul className="mt-3 space-y-2 text-muted-foreground list-disc list-inside">
              <li><strong className="text-foreground">Email magic link</strong> — a one-time sign-in link sent to your inbox. No password is stored.</li>
              <li><strong className="text-foreground">Google OAuth</strong> — we receive only your email address and display name from Google. No other Google account data is accessed.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Email forwarding (optional feature)</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you choose to use the email forwarding feature to auto-fill inventory from delivery order confirmations, your forwarded emails are processed to extract item names and quantities. Email content is not stored beyond what is added to your inventory.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Data retention and deletion</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your data is retained for as long as your account is active. To delete your account and all associated data, email us at{" "}
              <a href="mailto:varshaljain@gmail.com" className="text-primary underline underline-offset-2">varshaljain@gmail.com</a>{" "}
              with the subject line "Delete my account". We will process deletion within 7 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Cookies and local storage</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use browser cookies only for session management (Supabase auth token). We use <code className="bg-muted px-1 rounded">localStorage</code> to store your onboarding status and app preferences locally on your device. No tracking cookies are used.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Your rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              You have the right to access, correct, or delete your personal data at any time. Under India's Digital Personal Data Protection Act (DPDP) 2023 and applicable international regulations, you may also withdraw consent for data processing. Contact us at{" "}
              <a href="mailto:varshaljain@gmail.com" className="text-primary underline underline-offset-2">varshaljain@gmail.com</a>{" "}
              to exercise any of these rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Changes to this policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this policy occasionally. Material changes will be communicated via the email address associated with your account. Continued use of the app after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              Questions about this policy? Reach out at{" "}
              <a href="mailto:varshaljain@gmail.com" className="text-primary underline underline-offset-2">varshaljain@gmail.com</a>.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t bg-background py-6 mt-12">
        <div className="container mx-auto px-4 max-w-3xl flex gap-4 text-sm text-muted-foreground">
          <Link href="/" className="hover:underline">Home</Link>
          <Link href="/terms" className="hover:underline">Terms</Link>
          <a href="mailto:varshaljain@gmail.com" className="hover:underline">Contact</a>
        </div>
      </footer>
    </div>
  )
}
