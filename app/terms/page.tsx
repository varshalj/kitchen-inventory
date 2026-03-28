import Link from "next/link"
import { CookingPot } from "lucide-react"

export const metadata = {
  title: "Terms of Service | Kitchen Inventory",
  description: "Terms governing your use of Kitchen Inventory.",
}

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground text-sm mb-10">Last updated: March 2026</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Acceptance</h2>
            <p className="text-muted-foreground leading-relaxed">
              By creating an account or using Kitchen Inventory ("the app"), you agree to these Terms of Service. If you do not agree, do not use the app.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. What the app does</h2>
            <p className="text-muted-foreground leading-relaxed">
              Kitchen Inventory is a personal productivity tool that helps you track food items, expiry dates, shopping lists, and recipes in your household. It is provided as a personal-use application by Varshal Jain.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. No warranty on food safety</h2>
            <p className="text-muted-foreground leading-relaxed">
              The app displays expiry dates and related information that <strong className="text-foreground">you</strong> enter. It does not independently verify the safety or freshness of any food item. <strong className="text-foreground">You are solely responsible for all food safety decisions</strong> in your household. Never consume food you believe to be unsafe regardless of what the app shows.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Provided as-is</h2>
            <p className="text-muted-foreground leading-relaxed">
              The app is provided "as is" without warranties of any kind, express or implied. We do not guarantee uninterrupted availability or that the app will be error-free. Features may be added, modified, or removed at any time without notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Your account</h2>
            <p className="text-muted-foreground leading-relaxed">
              You are responsible for maintaining the confidentiality of your account. You must not share your account with others or use the app for any unlawful purpose. We reserve the right to terminate accounts that violate these terms, including accounts used for abuse, spam, or harmful activity.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. AI-generated content</h2>
            <p className="text-muted-foreground leading-relaxed">
              Some features (meal planning suggestions, recipe parsing) use AI models to generate content. AI-generated output may be inaccurate or incomplete. Always verify quantities, ingredients, and cooking instructions against trusted sources before use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Limitation of liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the fullest extent permitted by law, Varshal Jain shall not be liable for any indirect, incidental, or consequential damages arising from your use of the app, including but not limited to data loss or food safety incidents.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Data and privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your use of the app is also governed by our{" "}
              <Link href="/privacy" className="text-primary underline underline-offset-2">Privacy Policy</Link>,
              which is incorporated into these terms by reference.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Changes to these terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update these terms from time to time. Continued use of the app after changes constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              Questions about these terms? Contact us at{" "}
              <a href="mailto:varshaljain@gmail.com" className="text-primary underline underline-offset-2">varshaljain@gmail.com</a>.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t bg-background py-6 mt-12">
        <div className="container mx-auto px-4 max-w-3xl flex gap-4 text-sm text-muted-foreground">
          <Link href="/" className="hover:underline">Home</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
          <a href="mailto:varshaljain@gmail.com" className="hover:underline">Contact</a>
        </div>
      </footer>
    </div>
  )
}
