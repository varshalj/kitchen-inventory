"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Clock,
  ChefHat,
  ShoppingCart,
  Shield,
  Sparkles,
  Camera,
  Mail,
  Mic,
  Check,
  Bot,
  CookingPot,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

// ─── Inline UI mockups ────────────────────────────────────────────────────────

function InventoryMockup() {
  return (
    <div className="w-full max-w-xs mx-auto">
      {/* Phone frame */}
      <div className="rounded-3xl border-4 border-foreground shadow-2xl overflow-hidden bg-muted">
        {/* Status bar */}
        <div className="bg-foreground px-4 py-2 flex justify-between items-center">
          <span className="text-white text-[10px]">9:41</span>
          <div className="flex gap-1">
            <div className="w-3 h-1.5 bg-white/60 rounded-sm" />
            <div className="w-3 h-1.5 bg-white/60 rounded-sm" />
            <div className="w-3 h-1.5 bg-white/60 rounded-sm" />
          </div>
        </div>
        {/* App content */}
        <div className="bg-white px-3 pt-3 pb-4 space-y-2">
          <div className="flex justify-between items-center mb-3">
            <span className="font-bold text-sm">Kitchen Inventory</span>
            <span className="text-[10px] text-muted-foreground">3 items</span>
          </div>
          {/* Item 1 – expiring */}
          <div className="rounded-xl border p-2.5 bg-red-50 border-red-100">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold">Greek Yogurt</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Refrigerator · 500g</p>
              </div>
              <span className="text-[9px] font-medium bg-red-100 text-red-600 rounded-full px-1.5 py-0.5 shrink-0 ml-1">
                2 days
              </span>
            </div>
          </div>
          {/* Item 2 – ok */}
          <div className="rounded-xl border p-2.5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold">Basmati Rice</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Pantry · 2kg</p>
              </div>
              <span className="text-[9px] font-medium bg-green-100 text-green-700 rounded-full px-1.5 py-0.5 shrink-0 ml-1">
                6 mo
              </span>
            </div>
          </div>
          {/* Item 3 – expiring soon */}
          <div className="rounded-xl border p-2.5 bg-amber-50 border-amber-100">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold">Spinach</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Refrigerator · 1 bunch</p>
              </div>
              <span className="text-[9px] font-medium bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 shrink-0 ml-1">
                5 days
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ExpiryMockup() {
  return (
    <div className="rounded-xl border bg-white shadow-sm p-3 space-y-2 text-xs w-full">
      <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">Expiring soon</p>
      {[
        { name: "Paneer", loc: "Refrigerator", days: "1 day", color: "bg-red-100 text-red-600" },
        { name: "Coriander", loc: "Refrigerator", days: "3 days", color: "bg-amber-100 text-amber-700" },
        { name: "Milk", loc: "Refrigerator", days: "4 days", color: "bg-amber-100 text-amber-700" },
      ].map((item) => (
        <div key={item.name} className="flex items-center justify-between">
          <div>
            <p className="font-medium text-xs">{item.name}</p>
            <p className="text-[10px] text-muted-foreground">{item.loc}</p>
          </div>
          <span className={`text-[9px] font-medium rounded-full px-1.5 py-0.5 ${item.color}`}>{item.days}</span>
        </div>
      ))}
    </div>
  )
}

function RecipeMockup() {
  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden w-full text-xs">
      <div className="bg-gradient-to-r from-orange-400 to-red-400 p-3 text-white">
        <p className="font-bold text-sm">Palak Paneer</p>
        <p className="text-[10px] opacity-80 mt-0.5">30 min · 4 servings</p>
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-medium">
            82% pantry match
          </span>
          <span className="text-[10px] bg-purple-100 text-purple-700 rounded-full px-2 py-0.5 font-medium">
            YouTube
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground">Ingredients: Spinach ✓, Paneer ✓, Cream ✓, Spices…</p>
      </div>
    </div>
  )
}

function ShoppingMockup() {
  return (
    <div className="rounded-xl border bg-white shadow-sm p-3 space-y-2 w-full text-xs">
      <div className="flex justify-between items-center">
        <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">Shopping List</p>
        <div className="flex items-center gap-1 text-[10px] text-primary font-medium">
          <Mic className="h-3 w-3" /> Voice
        </div>
      </div>
      {[
        { name: "Tomatoes", done: false },
        { name: "Onions · 1kg", done: false },
        { name: "Butter", done: true },
      ].map((item) => (
        <div key={item.name} className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center ${item.done ? "bg-primary border-primary" : "border-input"}`}>
              {item.done && <Check className="h-2.5 w-2.5 text-white" />}
            </div>
            <span className={item.done ? "line-through text-muted-foreground" : ""}>{item.name}</span>
          </div>
          {!item.done && (
            <span className="text-[9px] bg-primary text-white rounded-full px-1.5 py-0.5 font-medium">BUY</span>
          )}
        </div>
      ))}
    </div>
  )
}

function ScanMockup() {
  return (
    <div className="rounded-xl border bg-white shadow-sm p-3 space-y-2 w-full text-xs">
      <div className="flex items-center gap-1.5 mb-1">
        <Camera className="h-3.5 w-3.5 text-primary" />
        <p className="font-semibold text-[11px] text-foreground">AI detected 4 items</p>
      </div>
      {[
        { name: "Amul Butter 500g", cat: "Dairy", include: true },
        { name: "Tata Salt 1kg", cat: "Pantry", include: true },
        { name: "Aashirvaad Atta 5kg", cat: "Grains", include: true },
        { name: "Tropicana Orange 1L", cat: "Beverages", include: false },
      ].map((item) => (
        <div key={item.name} className="flex items-center gap-2">
          <div className={`h-3 w-3 rounded border shrink-0 flex items-center justify-center ${item.include ? "bg-primary border-primary" : "border-input"}`}>
            {item.include && <Check className="h-2 w-2 text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate font-medium">{item.name}</p>
          </div>
          <span className="text-[9px] text-muted-foreground shrink-0">{item.cat}</span>
        </div>
      ))}
    </div>
  )
}

function EmailMockup() {
  return (
    <div className="rounded-xl border bg-white shadow-sm p-3 space-y-2 w-full text-xs">
      <div className="flex items-center gap-1.5 mb-1">
        <Mail className="h-3.5 w-3.5 text-primary" />
        <p className="font-semibold text-[11px] text-foreground">Order synced automatically</p>
      </div>
      <div className="rounded-lg bg-muted p-2 text-[10px] space-y-1">
        <p className="font-medium text-foreground">Blinkit · Order #BL84923</p>
        <p className="text-muted-foreground">3 items added to inventory</p>
      </div>
      <div className="flex flex-wrap gap-1">
        {["Swiggy", "Blinkit", "Zepto", "BigBasket", "Amazon Fresh"].map((s) => (
          <span key={s} className="text-[8px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">{s}</span>
        ))}
      </div>
    </div>
  )
}

function AIMockup() {
  return (
    <div className="rounded-xl border bg-white shadow-sm p-3 space-y-2 w-full text-xs">
      <div className="flex items-center gap-1.5 mb-1">
        <Bot className="h-3.5 w-3.5 text-primary" />
        <p className="font-semibold text-[11px] text-foreground">AI Assistant</p>
      </div>
      <div className="rounded-lg bg-muted p-2 space-y-1.5">
        <p className="text-[10px] text-muted-foreground italic">&quot;What&apos;s expiring this week?&quot;</p>
        <div className="rounded border bg-white p-1.5 space-y-1">
          <div className="flex justify-between">
            <span className="font-medium">Milk</span>
            <span className="text-red-500 font-medium">Tomorrow</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Yogurt</span>
            <span className="text-amber-500 font-medium">3 days</span>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">Works with ChatGPT, Claude, Cursor</p>
    </div>
  )
}

// ─── Main landing page ─────────────────────────────────────────────────────────

export function LandingPage() {
  const router = useRouter()

  const features = [
    {
      icon: <Clock className="h-10 w-10 text-primary mb-4" />,
      title: "Track expiry dates effortlessly",
      description:
        "Get alerts before items go bad. Know exactly what's in your fridge, pantry, and freezer — sorted by what needs to be used first.",
      mockup: <ExpiryMockup />,
      badge: null,
    },
    {
      icon: <ChefHat className="h-10 w-10 text-primary mb-4" />,
      title: "Import recipes from anywhere",
      description:
        "Paste a link from YouTube, Instagram, Twitter, or any food blog. Or paste raw recipe text. Recipes are matched against your pantry so you know exactly what you already have.",
      mockup: <RecipeMockup />,
      badge: null,
    },
    {
      icon: <ShoppingCart className="h-10 w-10 text-primary mb-4" />,
      title: "Smart shopping list",
      description:
        "Add items by voice, manually, or straight from a recipe. Tap Buy to order from Swiggy, Blinkit, Zepto, BigBasket, Flipkart Minutes and more — without leaving the app.",
      mockup: <ShoppingMockup />,
      badge: null,
    },
    {
      icon: <Camera className="h-10 w-10 text-primary mb-4" />,
      title: "Scan groceries with your camera",
      description:
        "Point your camera at a receipt or a bag of groceries. AI extracts the items and adds them to your inventory instantly — review and confirm before saving.",
      mockup: <ScanMockup />,
      badge: null,
    },
    {
      icon: <Bot className="h-10 w-10 text-primary mb-4" />,
      title: "Talk to your kitchen with AI",
      description:
        "Connect ChatGPT, Claude, or Cursor to your kitchen data. Ask what's expiring, get meal suggestions, or check your shopping list — all from your favourite AI assistant.",
      mockup: <AIMockup />,
      badge: null,
    },
    {
      icon: <Mail className="h-10 w-10 text-primary mb-4" />,
      title: "Auto-fill from delivery orders",
      description:
        "Forward your grocery order emails and items are automatically added to your inventory. Works with Swiggy, Blinkit, Zepto, BigBasket, Amazon, and more.",
      mockup: <EmailMockup />,
      badge: null,
    },
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 md:px-6 max-w-7xl flex h-14 items-center">
          <div className="flex items-center space-x-2">
            <div className="rounded-full bg-primary/10 p-1">
              <CookingPot className="h-5 w-5 text-primary" />
            </div>
            <span className="font-bold">Kitchen Inventory</span>
          </div>
          <div className="ml-auto">
            <Button asChild variant="ghost" size="sm">
              <Link href="/auth">Log in</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-white to-muted pt-6 pb-12 md:pt-10 md:pb-16">
          <div className="container mx-auto px-4 md:px-6 max-w-7xl">
            <div className="grid gap-10 md:grid-cols-2 md:gap-16 items-center">
              <div className="flex flex-col justify-center space-y-4">
                <div className="space-y-3">
                  <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                    Never waste food again. Track, cook, and shop smarter.
                  </h1>
                  <p className="text-muted-foreground md:text-xl leading-relaxed">
                    Track your kitchen inventory, import recipes matched to what you have, and shop from your phone with one tap.
                  </p>
                </div>
                <div className="flex flex-col gap-2 min-[400px]:flex-row">
                  <Button size="lg" className="gap-1" onClick={() => router.push("/auth")}>
                    Get Started <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link href="#features">See Features</Link>
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-center py-4">
                <InventoryMockup />
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="bg-white py-12 md:py-20">
          <div className="container mx-auto px-4 md:px-6 max-w-7xl">
            <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center mb-10">
              <h2 className="text-2xl font-bold tracking-tighter sm:text-3xl">
                Everything your kitchen needs, in one app
              </h2>
              <p className="max-w-[85%] text-muted-foreground md:text-xl/relaxed">
                From tracking what's in your fridge to importing recipes from YouTube — all the tools you need to reduce waste and cook more.
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <Card key={feature.title} className="relative overflow-hidden flex flex-col">
                  <div className="absolute top-0 right-0 h-16 w-16 translate-x-4 -translate-y-4 bg-primary/10 rounded-full" />
                  <CardContent className="p-6 flex flex-col gap-4 flex-1">
                    <div>
                      {feature.icon}
                      <div className="flex items-start gap-2">
                        <h3 className="text-xl font-bold">{feature.title}</h3>
                        {feature.badge && (
                          <span className="shrink-0 mt-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                            {feature.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{feature.description}</p>
                    </div>
                    <div className="mt-auto pt-2">{feature.mockup}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="bg-white py-12 md:py-16">
          <div className="container mx-auto px-4 md:px-6 max-w-7xl">
            <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
              <h2 className="text-2xl font-bold tracking-tighter sm:text-3xl">Frequently Asked Questions</h2>
              <p className="max-w-[85%] text-muted-foreground md:text-xl/relaxed">
                Find answers to common questions about how the app works.
              </p>
            </div>
            <div className="mx-auto max-w-3xl py-8">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>How does the email integration work?</AccordionTrigger>
                  <AccordionContent>
                    The app securely connects to your email account and scans for order confirmations from supported
                    grocery delivery services — Swiggy, Blinkit, Zepto, BigBasket, Amazon Fresh, and JioMart. When
                    you receive an order confirmation, items are automatically extracted and added to your inventory.
                    You can toggle this feature on or off for each connected account in your profile settings.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>Is my data secure and private?</AccordionTrigger>
                  <AccordionContent>
                    Yes. We only scan for order confirmation emails from supported grocery services and never access
                    your personal emails. Your inventory data is stored securely and is never shared with third parties.
                    You can delete your account and all associated data at any time from your profile settings.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-3">
                  <AccordionTrigger>How does recipe import work?</AccordionTrigger>
                  <AccordionContent>
                    Paste any URL — from YouTube, Instagram, Twitter, or a food blog — and the app extracts the recipe
                    automatically. You can also paste raw recipe text and the AI will structure it for you. Every saved
                    recipe gets a pantry compatibility score showing what percentage of ingredients you already have.
                    You can then add missing ingredients directly to your shopping list.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-4">
                  <AccordionTrigger>Do I need to manually add all my items?</AccordionTrigger>
                  <AccordionContent>
                    No! The app offers several convenient ways to add items: email integration automatically adds items
                    from grocery deliveries; AI camera scan lets you photograph a receipt or bag of groceries to add
                    multiple items at once; voice add lets you speak items into your shopping list hands-free; and Quick
                    Add covers common pantry staples with preset expiry estimates. Manual entry is always available too.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-primary text-primary-foreground py-12 md:py-16">
          <div className="container mx-auto px-4 md:px-6 max-w-7xl">
            <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
              <div className="inline-block rounded-full bg-primary-foreground/10 px-3 py-1 text-sm">
                <div className="flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Start reducing food waste today</span>
                </div>
              </div>
              <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                Ready to take control of your kitchen?
              </h2>
              <p className="max-w-[85%] text-primary-foreground/80 md:text-xl/relaxed">
                Join home cooks who've cut their food waste and cook more with what they already have.
              </p>
              <Button
                size="lg"
                className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                onClick={() => router.push("/auth")}
              >
                Get Started for Free
              </Button>
              <p className="text-xs text-primary-foreground/60 mt-2">
                Works as a native app on iOS and Android. No App Store needed.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white py-6 md:py-8">
        <div className="container mx-auto px-4 md:px-6 max-w-7xl">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-primary/10 p-1">
                <CookingPot className="h-5 w-5 text-primary" />
              </div>
              <span className="text-sm font-medium">Kitchen Inventory</span>
            </div>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <Link href="#" className="hover:underline">Terms</Link>
              <Link href="#" className="hover:underline">Privacy</Link>
              <Link href="#" className="hover:underline">Contact</Link>
            </div>
            <div className="flex items-center gap-1">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Secure &amp; Private</span>
            </div>
          </div>
          <div className="mt-4 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Kitchen Inventory. All rights reserved.
          </div>
          <div className="mt-2 text-center text-xs text-muted-foreground">
            Vibe coded with AI tools and crafted with love by{" "}
            <a
              href="mailto:varshaljain@gmail.com"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Varshal Jain
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
