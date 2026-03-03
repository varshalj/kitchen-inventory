"use client"

import type React from "react"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, Clock, ChefHat, Mail, ShoppingCart, Shield, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { useToast } from "@/hooks/use-toast"

export function LandingPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showOTP, setShowOTP] = useState(false)
  const [otp, setOtp] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setIsSubmitting(true)

    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false)
      setShowOTP(true)
    }, 1000)
  }

  const handleVerifyOTP = (e: React.FormEvent) => {
    e.preventDefault()
    if (!otp) return

    setIsSubmitting(true)

    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false)
      toast({
        title: "Successfully verified!",
        description: "Redirecting to your dashboard...",
      })

      // Redirect to dashboard
      setTimeout(() => {
        router.push("/dashboard")
      }, 1500)
    }, 1000)
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 md:px-6 max-w-7xl flex h-14 items-center">
          <div className="flex items-center space-x-2">
            <div className="rounded-full bg-primary/10 p-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-primary"
              >
                <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" />
                <line x1="6" x2="18" y1="17" y2="17" />
              </svg>
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
        <section className="relative overflow-hidden bg-gradient-to-b from-white to-gray-50 pt-6 pb-12 md:pt-10 md:pb-16">
          <div className="container mx-auto px-4 md:px-6 max-w-7xl">
            <div className="grid gap-6 md:grid-cols-2 md:gap-10">
              <div className="flex flex-col justify-center space-y-4">
                <div className="space-y-2">
                  <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                    Never waste food again. Track, plan, and save.
                  </h1>
                  <p className="text-gray-500 md:text-xl">
                    Keep track of your kitchen inventory, get AI-powered meal suggestions, and sync with your favorite
                    delivery apps.
                  </p>
                </div>
                <div className="flex flex-col gap-2 min-[400px]:flex-row">
                  <Button
                    size="lg"
                    className="gap-1"
                    onClick={() => document.getElementById("auth-section")?.scrollIntoView({ behavior: "smooth" })}
                  >
                    Get Started <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link href="#features">Learn More</Link>
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-xl border shadow-xl">
                  <Image
                    src="/placeholder.jpg"
                    alt="Kitchen inventory dashboard preview"
                    fill
                    className="object-cover"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <p className="text-sm font-medium text-white">
                      See how users save time with AI-powered meal planning
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section id="features" className="bg-white py-12 md:py-16">
          <div className="container mx-auto px-4 md:px-6 max-w-7xl">
            <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
              <h2 className="text-2xl font-bold tracking-tighter sm:text-3xl">
                Smart features to simplify your kitchen management
              </h2>
              <p className="max-w-[85%] text-gray-500 md:text-xl/relaxed">
                Our app helps you reduce food waste, save money, and cook delicious meals with what you have.
              </p>
            </div>
            <div className="mx-auto grid gap-6 py-8 md:grid-cols-3 md:gap-8">
              <Card className="relative overflow-hidden">
                <div className="absolute top-0 right-0 h-16 w-16 translate-x-4 -translate-y-4 bg-primary/10 rounded-full"></div>
                <CardContent className="p-6">
                  <Clock className="h-10 w-10 text-primary mb-4" />
                  <h3 className="text-xl font-bold">Track expiry dates effortlessly</h3>
                  <p className="text-gray-500 mt-2">
                    Never let food go bad again. Get timely notifications before items expire and reduce waste.
                  </p>
                </CardContent>
              </Card>
              <Card className="relative overflow-hidden">
                <div className="absolute top-0 right-0 h-16 w-16 translate-x-4 -translate-y-4 bg-primary/10 rounded-full"></div>
                <CardContent className="p-6">
                  <ChefHat className="h-10 w-10 text-primary mb-4" />
                  <h3 className="text-xl font-bold">Generate meal plans from your inventory</h3>
                  <p className="text-gray-500 mt-2">
                    AI-powered meal suggestions based on what's in your kitchen and what's about to expire.
                  </p>
                </CardContent>
              </Card>
              <Card className="relative overflow-hidden">
                <div className="absolute top-0 right-0 h-16 w-16 translate-x-4 -translate-y-4 bg-primary/10 rounded-full"></div>
                <CardContent className="p-6">
                  <ShoppingCart className="h-10 w-10 text-primary mb-4" />
                  <h3 className="text-xl font-bold">Sync with delivery apps automatically</h3>
                  <p className="text-gray-500 mt-2">
                    Connect with popular grocery delivery services to automatically update your inventory.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section className="bg-gray-50 py-12 md:py-16">
          <div className="container mx-auto px-4 md:px-6 max-w-7xl">
            <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
              <h2 className="text-2xl font-bold tracking-tighter sm:text-3xl">Loved by home cooks everywhere</h2>
              <p className="max-w-[85%] text-gray-500 md:text-xl/relaxed">
                See what our users are saying about how our app has transformed their kitchen management.
              </p>
            </div>
            <div className="mx-auto grid gap-6 py-8 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="rounded-full bg-primary/10 p-2">
                      <span className="text-lg font-bold text-primary">AR</span>
                    </div>
                    <div>
                      <h4 className="font-semibold">Anita R.</h4>
                      <p className="text-sm text-gray-500">Busy parent of 3</p>
                    </div>
                  </div>
                  <p className="text-gray-500">
                    "I used to throw away so much food every week. This app has cut my food waste by 80% and saved me at
                    least ₹2000 monthly. The meal suggestions are a lifesaver on busy weeknights!"
                  </p>
                  <div className="flex text-amber-400 mt-4">
                    {[...Array(5)].map((_, i) => (
                      <svg
                        key={i}
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        stroke="none"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="rounded-full bg-primary/10 p-2">
                      <span className="text-lg font-bold text-primary">RK</span>
                    </div>
                    <div>
                      <h4 className="font-semibold">Rahul K.</h4>
                      <p className="text-sm text-gray-500">Bachelor, tech professional</p>
                    </div>
                  </div>
                  <p className="text-gray-500">
                    "The email integration with delivery apps is genius! My Swiggy and BigBasket orders automatically
                    update my inventory. I've never been more organized with my groceries."
                  </p>
                  <div className="flex text-amber-400 mt-4">
                    {[...Array(5)].map((_, i) => (
                      <svg
                        key={i}
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        stroke="none"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="md:col-span-2 lg:col-span-1">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="rounded-full bg-primary/10 p-2">
                      <span className="text-lg font-bold text-primary">SP</span>
                    </div>
                    <div>
                      <h4 className="font-semibold">Sneha P.</h4>
                      <p className="text-sm text-gray-500">Health-conscious foodie</p>
                    </div>
                  </div>
                  <p className="text-gray-500">
                    "The AI meal planner is incredible! It suggests recipes based on what I have and what's expiring
                    soon. I've discovered so many creative ways to use ingredients I would have thrown away."
                  </p>
                  <div className="flex text-amber-400 mt-4">
                    {[...Array(5)].map((_, i) => (
                      <svg
                        key={i}
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill={i < 4 ? "currentColor" : "none"}
                        stroke={i < 4 ? "none" : "currentColor"}
                        strokeWidth="2"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Authentication Section */}
        <section id="auth-section" className="bg-white py-12 md:py-16">
          <div className="container mx-auto px-4 md:px-6 max-w-7xl">
            <div className="mx-auto max-w-md space-y-6 text-center">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tighter sm:text-3xl">Get Started Today</h2>
                <p className="text-gray-500">Join thousands of users who are reducing food waste and saving money.</p>
              </div>

              {!showOTP ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-12"
                    />
                  </div>
                  <Button type="submit" className="w-full h-12" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        <span>Processing...</span>
                      </div>
                    ) : (
                      <span>Continue with Email</span>
                    )}
                  </Button>
                  <p className="text-xs text-gray-500">
                    We'll send a one-time password to your email. No need to create and remember a password.
                  </p>
                </form>
              ) : (
                <form onSubmit={handleVerifyOTP} className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm text-left font-medium">Enter the 6-digit code sent to {email}</p>
                    <Input
                      type="text"
                      placeholder="Enter 6-digit code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      required
                      className="h-12 text-center text-lg tracking-widest"
                      maxLength={6}
                    />
                  </div>
                  <Button type="submit" className="w-full h-12" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        <span>Verifying...</span>
                      </div>
                    ) : (
                      <span>Verify & Continue</span>
                    )}
                  </Button>
                  <div className="flex justify-between text-xs text-gray-500">
                    <button type="button" className="underline" onClick={() => setShowOTP(false)}>
                      Change email
                    </button>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        toast({
                          title: "Code resent!",
                          description: "Please check your email for the new code.",
                        })
                      }}
                    >
                      Resend code
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="bg-gray-50 py-12 md:py-16">
          <div className="container mx-auto px-4 md:px-6 max-w-7xl">
            <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
              <h2 className="text-2xl font-bold tracking-tighter sm:text-3xl">Frequently Asked Questions</h2>
              <p className="max-w-[85%] text-gray-500 md:text-xl/relaxed">
                Find answers to common questions about our app.
              </p>
            </div>
            <div className="mx-auto max-w-3xl py-8">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>How does the email integration work?</AccordionTrigger>
                  <AccordionContent>
                    Our app securely connects to your email account and scans for order confirmations from supported
                    grocery delivery services like Swiggy, Blinkit, Zepto, BigBasket, Amazon Fresh, and JioMart. When
                    you receive an order confirmation, we automatically extract the items and add them to your
                    inventory. You can toggle this feature on/off for each email account in your profile settings.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>Is my data secure and private?</AccordionTrigger>
                  <AccordionContent>
                    Yes, we take your privacy seriously. We only scan for order confirmation emails from supported
                    grocery services and never read your personal emails. Your inventory data is stored securely and is
                    never shared with third parties without your explicit consent. You can delete your account and all
                    associated data at any time from your profile settings.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-3">
                  <AccordionTrigger>How does the AI meal planning work?</AccordionTrigger>
                  <AccordionContent>
                    Our AI meal planner analyzes your current inventory, prioritizing items that are expiring soon. It
                    generates personalized meal suggestions based on your preferences, dietary restrictions, and cooking
                    skill level. The meal plans include recipes that maximize the use of your available ingredients,
                    helping you reduce food waste and save money.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-4">
                  <AccordionTrigger>Do I need to manually add all my items?</AccordionTrigger>
                  <AccordionContent>
                    No! While you can manually add items, our app offers several convenient options: 1) Email
                    integration automatically adds items from your grocery deliveries, 2) Receipt scanning lets you
                    quickly add multiple items by taking a photo of your receipt, and 3) Quick Add feature for common
                    items with preset expiry dates. These features make inventory management effortless.
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
                Ready to transform your kitchen management?
              </h2>
              <p className="max-w-[85%] text-primary-foreground/80 md:text-xl/relaxed">
                Join thousands of users who are saving time, money, and reducing food waste.
              </p>
              <Button
                size="lg"
                className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                onClick={() => document.getElementById("auth-section")?.scrollIntoView({ behavior: "smooth" })}
              >
                Get Started for Free
              </Button>
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
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5 text-primary"
                >
                  <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" />
                  <line x1="6" x2="18" y1="17" y2="17" />
                </svg>
              </div>
              <span className="text-sm font-medium">Kitchen Inventory</span>
            </div>
            <div className="flex gap-4 text-sm text-gray-500">
              <Link href="#" className="hover:underline">
                Terms
              </Link>
              <Link href="#" className="hover:underline">
                Privacy
              </Link>
              <Link href="#" className="hover:underline">
                Contact
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Shield className="h-4 w-4 text-gray-500" />
                <span className="text-xs text-gray-500">Secure & Private</span>
              </div>
              <div className="flex items-center gap-1">
                <Mail className="h-4 w-4 text-gray-500" />
                <span className="text-xs text-gray-500">support@kitcheninventory.app</span>
              </div>
            </div>
          </div>
          <div className="mt-6 text-center text-xs text-gray-500">© 2023 Kitchen Inventory. All rights reserved.</div>
        </div>
      </footer>
    </div>
  )
}
