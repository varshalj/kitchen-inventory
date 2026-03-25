"use client"

import { supabase } from "@/lib/supabase-client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Bell, LogOut, User, DollarSign, Archive, Mail, Plus, Trash, Store, X, MapPin, AlertTriangle, Globe, ShoppingBag, Bug, RotateCcw, Bot, Copy, Check, ChevronDown, ChevronRight, ShieldCheck, ExternalLink, Filter } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MainLayout } from "@/components/main-layout"
import { useUserSettings } from "@/hooks/use-user-settings"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CURRENCIES } from "@/components/currency-input"
import { AVAILABLE_EMAIL_SERVICES } from "@/lib/dev-seed-fixtures"
import { FEATURE_FLAGS } from "@/lib/feature-flags"
import { fetchWithAuth } from "@/lib/api-client"
import { GROCERY_PLATFORMS } from "@/lib/grocery-platforms"
import { BugReportDialog } from "@/components/bug-report-dialog"
import { useOnboarding } from "@/hooks/use-onboarding"

interface EmailAccount {
  id: string
  email: string
  services: string[]
  active: boolean
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  )
}

function PlatformInstructions({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border rounded-lg">
      <button
        className="w-full flex items-center justify-between p-3 text-sm font-medium text-left"
        onClick={() => setOpen(!open)}
      >
        {title}
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && <div className="px-3 pb-3 text-xs text-muted-foreground space-y-2">{children}</div>}
    </div>
  )
}

function ConnectToAISection() {
  const mcpBaseUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/mcp`
    : "/api/mcp"
  // The Streamable HTTP endpoint is at /api/mcp/mcp (the [transport] segment = "mcp")
  const mcpUrl = `${mcpBaseUrl}/mcp`

  const configSnippet = JSON.stringify(
    {
      mcpServers: {
        kitchen_inventory: {
          command: "npx",
          args: ["-y", "mcp-remote", mcpUrl, "--transport", "http-only"],
        },
      },
    },
    null,
    2,
  )

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center">
          <Bot className="mr-2 h-4 w-4" />
          Connect to AI
        </CardTitle>
        <CardDescription>
          Let AI assistants query your inventory, shopping list, recipes, and waste analytics
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg border p-2.5 bg-muted/50">
          <code className="text-xs flex-1 break-all select-all">{mcpUrl}</code>
          <CopyButton text={mcpUrl} />
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-2.5">
          <ShieldCheck className="h-4 w-4 text-green-700 mt-0.5 shrink-0" />
          <p className="text-xs text-green-800">
            Uses your existing login via OAuth. AI assistants can only read your data (read-only access).
          </p>
        </div>

        <div className="space-y-2">
          <PlatformInstructions title="ChatGPT">
            <p>1. Open ChatGPT Settings &gt; Apps &gt; Create App</p>
            <p>2. Set MCP Server URL to the URL above</p>
            <p>3. Authentication: OAuth (auto-discovered)</p>
            <p>4. Save and start chatting with your kitchen data</p>
          </PlatformInstructions>

          <PlatformInstructions title="Claude Desktop / Cursor / Windsurf">
            <p>Add this to your MCP config file:</p>
            <div className="relative">
              <pre className="bg-gray-900 text-gray-100 text-[10px] rounded p-2.5 overflow-x-auto">
                {configSnippet}
              </pre>
              <div className="absolute top-1.5 right-1.5">
                <CopyButton text={configSnippet} />
              </div>
            </div>
            <p className="mt-1">
              Config file locations: Claude Desktop (~/.claude/claude_desktop_config.json),
              Cursor (.cursor/mcp.json), Windsurf (~/.codeium/windsurf/mcp_config.json)
            </p>
          </PlatformInstructions>
        </div>
      </CardContent>
    </Card>
  )
}

export function ProfileSettings() {
  const router = useRouter()
  const { settings, updateSettings } = useUserSettings()
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: { user: { name?: string; email?: string } | null } }) => {
      setUser(data.user)
    })
  }, [])
  const { toast } = useToast()
  const [expiryReminders, setExpiryReminders] = useState(true)
  const [weeklyReports, setWeeklyReports] = useState(false)
  const [archivedItemsCount, setArchivedItemsCount] = useState(0)
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([])
  const [showAddEmailDialog, setShowAddEmailDialog] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [newSource, setNewSource] = useState("")
  const [newLocation, setNewLocation] = useState("")
  const [confirmRemove, setConfirmRemove] = useState<{ type: "source" | "location"; value: string; affectedCount: number } | null>(null)
  const [showBugReport, setShowBugReport] = useState(false)
  const { reset: resetOnboarding } = useOnboarding()
  const [emailToken, setEmailToken] = useState<string | null>(null)
  const [emailTokenLoading, setEmailTokenLoading] = useState(false)
  const [showForwardingGuide, setShowForwardingGuide] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (settings) {
        setExpiryReminders(settings.notifications)
      }

      const response = await fetchWithAuth("/api/inventory?archived=true")
      const archivedItems = await response.json()
      setArchivedItemsCount(archivedItems.length)
    }

    void load()
  }, [settings])

  useEffect(() => {
    fetchWithAuth("/api/email-forwarding-token")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.token) setEmailToken(data.token)
      })
      .catch(() => {})
  }, [])

  const handleCurrencyChange = (value: string) => {
    updateSettings({ currency: value })
  }

  const handleAddSource = () => {
    const trimmed = newSource.trim()
    if (!trimmed) return
    const current = settings?.orderSources || []
    if (current.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      toast({ title: "Already exists", description: `"${trimmed}" is already in your sources list.` })
      return
    }
    updateSettings({ orderSources: [...current, trimmed] })
    setNewSource("")
    toast({ title: "Source Added", description: `"${trimmed}" has been added to your order sources.` })
  }

  const handleRemoveSource = async (source: string) => {
    const response = await fetchWithAuth("/api/inventory")
    const items = await response.json()
    const affectedCount = items.filter((i: { orderedFrom?: string }) => i.orderedFrom === source).length
    if (affectedCount > 0) {
      setConfirmRemove({ type: "source", value: source, affectedCount })
    } else {
      doRemoveSource(source)
    }
  }

  const doRemoveSource = (source: string) => {
    const current = settings?.orderSources || []
    updateSettings({ orderSources: current.filter((s) => s !== source) })
    toast({ title: "Source Removed", description: `"${source}" has been removed from your order sources.` })
    setConfirmRemove(null)
  }

  const handleAddLocation = () => {
    const trimmed = newLocation.trim()
    if (!trimmed) return
    const current = settings?.storageLocations || []
    if (current.some((l) => l.toLowerCase() === trimmed.toLowerCase())) {
      toast({ title: "Already exists", description: `"${trimmed}" is already in your locations list.` })
      return
    }
    updateSettings({ storageLocations: [...current, trimmed] })
    setNewLocation("")
    toast({ title: "Location Added", description: `"${trimmed}" has been added to your storage locations.` })
  }

  const handleRemoveLocation = async (location: string) => {
    const response = await fetchWithAuth("/api/inventory")
    const items = await response.json()
    const affectedCount = items.filter((i: { location?: string }) => i.location === location).length
    if (affectedCount > 0) {
      setConfirmRemove({ type: "location", value: location, affectedCount })
    } else {
      doRemoveLocation(location)
    }
  }

  const doRemoveLocation = (location: string) => {
    const current = settings?.storageLocations || []
    updateSettings({ storageLocations: current.filter((l) => l !== location) })
    toast({ title: "Location Removed", description: `"${location}" has been removed from your storage locations.` })
    setConfirmRemove(null)
  }

  const handleConfirmRemove = () => {
    if (!confirmRemove) return
    if (confirmRemove.type === "source") {
      doRemoveSource(confirmRemove.value)
    } else {
      doRemoveLocation(confirmRemove.value)
    }
  }

  const handleToggleEmailAccount = (id: string) => {
    setEmailAccounts((accounts) =>
      accounts.map((account) => (account.id === id ? { ...account, active: !account.active } : account)),
    )
  }

  const handleDeleteEmailAccount = (id: string) => {
    setEmailAccounts((accounts) => accounts.filter((account) => account.id !== id))
  }

  const handleAddEmail = () => {
    if (!newEmail.trim() || selectedServices.length === 0) return

    const newAccount: EmailAccount = {
      id: Date.now().toString(),
      email: newEmail,
      services: selectedServices,
      active: true,
    }

    setEmailAccounts([...emailAccounts, newAccount])
    setNewEmail("")
    setSelectedServices([])
    setShowAddEmailDialog(false)

    toast({
      title: "Email Added",
      description: `${newEmail} has been added for syncing ${selectedServices.length} service${selectedServices.length !== 1 ? "s" : ""}.`,
    })
  }

  const toggleService = (service: string) => {
    setSelectedServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    )
  }

  const toggleAllServices = () => {
    if (selectedServices.length === availableServices.length) {
      setSelectedServices([])
    } else {
      setSelectedServices([...availableServices])
    }
  }

  const availableServices = ["Gmail", "Swiggy", "Blinkit", "Zepto", "BigBasket", "Amazon Fresh", "JioMart"]

  return (
    <MainLayout>
      <div className="flex items-center mb-6">
        <Button variant="ghost" size="icon" className="mr-2" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back</span>
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Profile</h1>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div>
              <CardTitle>{user?.name || "Guest User"}</CardTitle>
              <CardDescription>{user?.email || "No signed-in email"}</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center">
            <Mail className="mr-2 h-4 w-4" />
            Email Order Import
          </CardTitle>
          <CardDescription>Forward grocery order emails to add items automatically</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {emailToken ? (
            <>
              {/* Step 1 */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 1 — Copy your forwarding address</p>
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                  <code className="text-sm flex-1 break-all select-all">
                    kinv.orders+{emailToken}@gmail.com
                  </code>
                  <CopyButton text={`kinv.orders+${emailToken}@gmail.com`} />
                </div>
              </div>

              {/* Step 2 */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 2 — Set up Gmail auto-forwarding</p>
                <p className="text-xs text-muted-foreground">
                  Create a Gmail filter that automatically forwards order emails from Swiggy, Blinkit, Zepto and others to your address above.
                </p>
                <a
                  href={`https://mail.google.com/mail/u/0/#create-filter?from=(swiggy.in+OR+swiggy.com+OR+blinkit.com+OR+grofers.com+OR+zepto.co+OR+zeptonow.com+OR+bigbasket.com+OR+amazon.in+OR+flipkart.com+OR+jiomart.com+OR+dunzo.com+OR+countrydelight.in)`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <Filter className="h-3.5 w-3.5" />
                  Open Gmail filter setup
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
                <p className="text-xs text-muted-foreground">
                  In Gmail: scroll to <span className="font-medium">Forward it to</span> → click <span className="font-medium">Add forwarding address</span> → paste your address from Step 1 → click <span className="font-medium">Create filter</span>.
                </p>

                <div>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setShowForwardingGuide(!showForwardingGuide)}
                  >
                    {showForwardingGuide ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    Not using Gmail? See filter criteria
                  </button>
                  {showForwardingGuide && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-start gap-2 bg-muted/50 rounded-lg px-3 py-2">
                        <code className="text-xs flex-1 break-all select-all text-muted-foreground">
                          (swiggy.in OR swiggy.com OR blinkit.com OR grofers.com OR zepto.co OR zeptonow.com OR bigbasket.com OR amazon.in OR flipkart.com OR jiomart.com OR dunzo.com OR countrydelight.in)
                        </code>
                        <CopyButton text="(swiggy.in OR swiggy.com OR blinkit.com OR grofers.com OR zepto.co OR zeptonow.com OR bigbasket.com OR amazon.in OR flipkart.com OR jiomart.com OR dunzo.com OR countrydelight.in)" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Use this as the <span className="font-medium">From</span> criteria when creating a filter in your email client.{" "}
                        <a
                          href="https://support.google.com/mail/answer/10957?hl=en"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-0.5"
                        >
                          Gmail forwarding guide
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 3 */}
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-0.5">
                <p className="text-xs font-semibold text-amber-800">Step 3 — Wait for activation (up to 24h)</p>
                <p className="text-xs text-amber-700">
                  After you add the forwarding address, Gmail sends us a confirmation. We'll verify it shortly. Once confirmed, all future order emails forward automatically.
                </p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={async () => {
                    setEmailTokenLoading(true)
                    try {
                      const res = await fetchWithAuth("/api/email-forwarding-token", { method: "POST" })
                      const data = await res.json()
                      if (data?.token) {
                        setEmailToken(data.token)
                        toast({ title: "New address generated", description: "Your old forwarding address no longer works. Update your Gmail filter too." })
                      }
                    } catch {
                      toast({ title: "Failed to regenerate", variant: "destructive" })
                    } finally {
                      setEmailTokenLoading(false)
                    }
                  }}
                  disabled={emailTokenLoading}
                >
                  {emailTokenLoading ? "Generating..." : "Generate new address"}
                </button>

                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  onClick={() => setShowBugReport(true)}
                >
                  <Bug className="h-3 w-3" />
                  Email not processed?
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">
                Generate a forwarding address to start importing orders from email automatically
              </p>
              <Button
                variant="outline"
                onClick={async () => {
                  setEmailTokenLoading(true)
                  try {
                    const res = await fetchWithAuth("/api/email-forwarding-token", { method: "POST" })
                    const data = await res.json()
                    if (data?.token) {
                      setEmailToken(data.token)
                      toast({ title: "Forwarding address created", description: "Follow the steps below to complete setup." })
                    }
                  } catch {
                    toast({ title: "Failed to generate", variant: "destructive" })
                  } finally {
                    setEmailTokenLoading(false)
                  }
                }}
                disabled={emailTokenLoading}
              >
                <Mail className="h-4 w-4 mr-2" />
                {emailTokenLoading ? "Generating..." : "Set Up Email Import"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {(!FEATURE_FLAGS.EMAIL_SCRAPING || !FEATURE_FLAGS.NOTIFICATIONS) && (
        <p className="mb-6 text-sm text-muted-foreground">Some phase-2 capabilities are hidden during the closed beta.</p>
      )}

      {FEATURE_FLAGS.EMAIL_SCRAPING && (
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center">
            <Mail className="mr-2 h-4 w-4" />
            Email Integration
          </CardTitle>
          <CardDescription>Sync orders from grocery delivery services</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-sm font-medium">Connected Accounts</p>
              <Button variant="outline" size="sm" onClick={() => setShowAddEmailDialog(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Email
              </Button>
            </div>

            {emailAccounts.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">
                No email accounts connected. Add an email to sync your grocery orders.
              </div>
            ) : (
              <div className="space-y-2">
                {emailAccounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between p-2 border rounded-md">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{account.email}</span>
                        <span className="text-xs text-muted-foreground">{account.services.join(", ")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={account.active}
                        onCheckedChange={() => handleToggleEmailAccount(account.id)}
                        aria-label={`Toggle ${account.email}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDeleteEmailAccount(account.id)}
                      >
                        <Trash className="h-3.5 w-3.5" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            <p>
              We'll scan your emails for order confirmations from supported grocery services and automatically add items
              to your inventory.
            </p>
            <p className="mt-1">Items without expiry dates will be flagged for you to update.</p>
          </div>
        </CardContent>
      </Card>

      )}

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center">
            <Archive className="mr-2 h-4 w-4" />
            Archived Items
          </CardTitle>
          <CardDescription>View your consumed and wasted items</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm">You have {archivedItemsCount} archived items</p>
              <p className="text-xs text-muted-foreground mt-1">View consumption and waste history</p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/archived">View Archive</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <DollarSign className="mr-2 h-4 w-4" />
            Currency Settings
          </CardTitle>
          <CardDescription>Choose your preferred currency for prices. This is used as the default across the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="default-currency">Default Currency</Label>
            <Select value={settings?.currency || "INR"} onValueChange={handleCurrencyChange}>
              <SelectTrigger id="default-currency" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.symbol} {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Globe className="mr-2 h-4 w-4" />
            Country
          </CardTitle>
          <CardDescription>Set your country to enable local grocery platform integrations.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="country-select">Country</Label>
            <Select
              value={settings?.country || "IN"}
              onValueChange={(value) => {
                updateSettings({ country: value })
                if (value !== "IN") {
                  updateSettings({ deliveryPlatforms: [] })
                }
              }}
            >
              <SelectTrigger id="country-select" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN">India</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {settings?.country === "IN" && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <ShoppingBag className="mr-2 h-4 w-4" />
              Delivery Platforms
            </CardTitle>
            <CardDescription>Select the grocery delivery services available in your area. These will appear as &quot;Buy&quot; options on your shopping list.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Available Platforms</p>
              <button
                type="button"
                onClick={() => {
                  const allIds = GROCERY_PLATFORMS.map((p) => p.id)
                  const allSelected = (settings?.deliveryPlatforms || []).length === allIds.length
                  updateSettings({ deliveryPlatforms: allSelected ? [] : allIds })
                }}
                className="text-xs text-primary hover:underline font-medium"
              >
                {(settings?.deliveryPlatforms || []).length === GROCERY_PLATFORMS.length ? "Deselect All" : "Select All"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {GROCERY_PLATFORMS.map((platform) => {
                const isChecked = (settings?.deliveryPlatforms || []).includes(platform.id)
                return (
                  <label key={platform.id} className="flex items-center gap-2.5 cursor-pointer group">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        const current = settings?.deliveryPlatforms || []
                        const updated = checked
                          ? [...current, platform.id]
                          : current.filter((id) => id !== platform.id)
                        updateSettings({ deliveryPlatforms: updated })
                      }}
                    />
                    <span className="text-sm group-hover:text-foreground transition-colors">{platform.name}</span>
                  </label>
                )
              })}
            </div>

            {(settings?.deliveryPlatforms || []).length > 0 && (
              <p className="text-xs text-muted-foreground">
                {(settings?.deliveryPlatforms || []).length} platform{(settings?.deliveryPlatforms || []).length !== 1 ? "s" : ""} selected
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Store className="mr-2 h-4 w-4" />
            Order Sources
          </CardTitle>
          <CardDescription>Manage where you order groceries from. This list appears in the &quot;Ordered from&quot; dropdown when adding items.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(settings?.orderSources || []).map((source) => (
              <div
                key={source}
                className="flex items-center gap-1 bg-muted px-3 py-1.5 rounded-full text-sm"
              >
                <span>{source}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveSource(source)}
                  className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Remove ${source}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {(settings?.orderSources || []).length === 0 && (
              <p className="text-sm text-muted-foreground">No sources added. Add your grocery stores below.</p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add a new source..."
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleAddSource()
                }
              }}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleAddSource}
              disabled={!newSource.trim()}
            >
              <Plus className="h-4 w-4" />
              <span className="sr-only">Add source</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <MapPin className="mr-2 h-4 w-4" />
            Storage Locations
          </CardTitle>
          <CardDescription>Customize where you store food. This list appears in the &quot;Storage Location&quot; dropdown when adding or editing items.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(settings?.storageLocations || []).map((location) => (
              <div
                key={location}
                className="flex items-center gap-1 bg-muted px-3 py-1.5 rounded-full text-sm"
              >
                <span>{location}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveLocation(location)}
                  className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Remove ${location}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {(settings?.storageLocations || []).length === 0 && (
              <p className="text-sm text-muted-foreground">No locations added. Add your storage locations below.</p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add a new location..."
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleAddLocation()
                }
              }}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleAddLocation}
              disabled={!newLocation.trim()}
            >
              <Plus className="h-4 w-4" />
              <span className="sr-only">Add location</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {FEATURE_FLAGS.NOTIFICATIONS && (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </CardTitle>
          <CardDescription>Manage how you receive notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="expiry-reminders">Expiry Reminders</Label>
              <p className="text-sm text-muted-foreground">Get notified when items are about to expire</p>
            </div>
            <Switch
              id="expiry-reminders"
              checked={expiryReminders}
              onCheckedChange={(checked) => {
                setExpiryReminders(checked)
                updateSettings({ notifications: checked })
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="weekly-reports">Weekly Reports</Label>
              <p className="text-sm text-muted-foreground">Receive a weekly summary of your inventory</p>
            </div>
            <Switch id="weekly-reports" checked={weeklyReports} onCheckedChange={setWeeklyReports} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="expiry-missing">Missing Expiry Date Alerts</Label>
              <p className="text-sm text-muted-foreground">Get notified when items are added without expiry dates</p>
            </div>
            <Switch id="expiry-missing" checked={true} />
          </div>
        </CardContent>
      </Card>

      )}

      <ConnectToAISection />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Bug className="mr-2 h-4 w-4" />
            Help & Feedback
          </CardTitle>
          <CardDescription>Report issues or restart the app tour</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            className="w-full active:scale-95 transition-transform"
            onClick={() => setShowBugReport(true)}
          >
            <Bug className="mr-2 h-4 w-4" />
            Report a Bug
          </Button>
          <Button
            variant="outline"
            className="w-full active:scale-95 transition-transform"
            onClick={() => {
              resetOnboarding()
              toast({
                title: "Tour reset",
                description: "Visit the dashboard to start the guided tour again.",
              })
              router.push("/dashboard")
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Restart App Tour
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Account</CardTitle>
        </CardHeader>
        <CardFooter>
          <Button
            variant="outline"
            className="w-full text-destructive"
            onClick={async () => {
              await supabase.auth.signOut()
              router.push("/auth")
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </CardFooter>
      </Card>

      <BugReportDialog open={showBugReport} onOpenChange={setShowBugReport} />

      {/* Confirm Removal Dialog */}
      <AlertDialog open={!!confirmRemove} onOpenChange={(open) => !open && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Remove &quot;{confirmRemove?.value}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove?.type === "source" ? (
                <>
                  This source is currently linked to <strong>{confirmRemove.affectedCount} item{confirmRemove.affectedCount !== 1 ? "s" : ""}</strong> in your inventory.
                  Removing it will clear the &quot;Ordered from&quot; field on those items. This action cannot be undone.
                </>
              ) : (
                <>
                  This location is currently used by <strong>{confirmRemove?.affectedCount} item{confirmRemove?.affectedCount !== 1 ? "s" : ""}</strong> in your inventory.
                  Removing it will leave those items with a location that no longer appears in your dropdown. You may want to reassign them first.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {FEATURE_FLAGS.EMAIL_SCRAPING && (
      <Dialog open={showAddEmailDialog} onOpenChange={setShowAddEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Email Account</DialogTitle>
            <DialogDescription>
              Connect an email account to sync orders from grocery delivery services.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Scan orders from</Label>
                <button
                  type="button"
                  onClick={toggleAllServices}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  {selectedServices.length === availableServices.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {availableServices.map((service) => {
                  const isChecked = selectedServices.includes(service)
                  return (
                    <label
                      key={service}
                      className="flex items-center gap-2.5 cursor-pointer group"
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleService(service)}
                        id={`service-${service.toLowerCase().replace(/\s+/g, "-")}`}
                      />
                      <span className="text-sm group-hover:text-foreground transition-colors">
                        {service}
                      </span>
                    </label>
                  )
                })}
              </div>
              {selectedServices.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedServices.length} service{selectedServices.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddEmailDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddEmail} disabled={!newEmail.trim() || selectedServices.length === 0}>
              Add Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </MainLayout>
  )
}
