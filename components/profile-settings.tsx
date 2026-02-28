"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Bell, LogOut, User, DollarSign, Archive, Mail, Plus, Trash, Store, X, MapPin, AlertTriangle, KeyRound, ShieldCheck, RotateCw } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MainLayout } from "@/components/main-layout"
import { useUserSettings } from "@/hooks/use-user-settings"
import { getArchivedItems, getInventoryItems } from "@/lib/client/api"
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

interface EmailAccount {
  id: string
  email: string
  services: string[]
  active: boolean
}

interface ApiKeyVersion {
  version: number
  provider: string
  model: string
  status: "active" | "revoked"
  keyMetadata: {
    maskedKey: string
    fingerprint: string
  }
  createdAt: string
  revokedAt?: string
}

interface ApiKeyAudit {
  action: "validated" | "rotated" | "revoked"
  version: number
  createdAt: string
  actor: string
  details: string
}

export function ProfileSettings() {
  const { settings, updateSettings } = useUserSettings()
  const { toast } = useToast()
  const [expiryReminders, setExpiryReminders] = useState(true)
  const [weeklyReports, setWeeklyReports] = useState(false)
  const [archivedItemsCount, setArchivedItemsCount] = useState(0)
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([
    { id: "1", email: "john.doe@gmail.com", services: ["Gmail"], active: true },
  ])
  const [showAddEmailDialog, setShowAddEmailDialog] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [newSource, setNewSource] = useState("")
  const [newLocation, setNewLocation] = useState("")
  const [confirmRemove, setConfirmRemove] = useState<{ type: "source" | "location"; value: string; affectedCount: number } | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [aiModel, setAiModel] = useState("gpt-4o-mini")
  const [apiKeyVersions, setApiKeyVersions] = useState<ApiKeyVersion[]>([])
  const [apiAuditTrail, setApiAuditTrail] = useState<ApiKeyAudit[]>([])
  const [apiLoading, setApiLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (settings) {
        setExpiryReminders(settings.notifications)
      }

      const archivedItems = await getArchivedItems()
      setArchivedItemsCount(archivedItems.length)
    }

    void load()
  }, [settings])

  const loadAiSettings = async () => {
    const response = await fetch("/api/user-ai-keys", { cache: "no-store" })
    if (!response.ok) return
    const data = await response.json()
    setApiKeyVersions(data.keyVersions || [])
    setApiAuditTrail(data.auditTrail || [])
  }

  useEffect(() => {
    void loadAiSettings()
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
    const items = await getInventoryItems()
    const affectedCount = items.filter((i) => i.orderedFrom === source).length
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
    const items = await getInventoryItems()
    const affectedCount = items.filter((i) => i.location === location).length
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
  const activeKey = apiKeyVersions.find((version) => version.status === "active")

  const handleValidateKey = async () => {
    if (!apiKeyInput.trim()) return
    setApiLoading(true)
    try {
      const response = await fetch("/api/user-ai-keys/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKeyInput, model: aiModel }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Validation failed")
      }

      toast({
        title: "Key validated",
        description: `Fingerprint ${data.keyMetadata.fingerprint} is valid for ${aiModel}.`,
      })
    } catch (error) {
      toast({
        title: "Validation failed",
        description: error instanceof Error ? error.message : "Invalid API key",
        variant: "destructive",
      })
    } finally {
      setApiLoading(false)
    }
  }

  const handleRotateKey = async () => {
    if (!apiKeyInput.trim()) return
    setApiLoading(true)
    try {
      const response = await fetch("/api/user-ai-keys/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKeyInput, model: aiModel }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Rotation failed")
      }

      setApiKeyInput("")
      await loadAiSettings()
      toast({
        title: "Key rotated",
        description: `Active key is now version ${data.version.version} (${data.version.keyMetadata.fingerprint}).`,
      })
    } catch (error) {
      toast({
        title: "Rotation failed",
        description: error instanceof Error ? error.message : "Unable to rotate key",
        variant: "destructive",
      })
    } finally {
      setApiLoading(false)
    }
  }

  const handleRevokeKey = async () => {
    setApiLoading(true)
    try {
      const response = await fetch("/api/user-ai-keys/revoke", {
        method: "POST",
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Revoke failed")
      }

      await loadAiSettings()
      toast({
        title: "Key revoked",
        description: `Version ${data.revoked.version} is revoked and no longer active.`,
      })
    } catch (error) {
      toast({
        title: "Revoke failed",
        description: error instanceof Error ? error.message : "Unable to revoke key",
        variant: "destructive",
      })
    } finally {
      setApiLoading(false)
    }
  }

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
              <CardTitle>John Doe</CardTitle>
              <CardDescription>john.doe@example.com</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <KeyRound className="mr-2 h-4 w-4" />
            AI API Key Vault
          </CardTitle>
          <CardDescription>Keys are validated, encrypted server-side, and never returned in plaintext.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-model">Model for key validation</Label>
            <Input id="ai-model" value={aiModel} onChange={(e) => setAiModel(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-api-key">API key</Label>
            <Input
              id="ai-api-key"
              type="password"
              placeholder="sk-..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleValidateKey} disabled={apiLoading || !apiKeyInput.trim()}>
              <ShieldCheck className="h-4 w-4 mr-2" />
              Validate Key
            </Button>
            <Button onClick={handleRotateKey} disabled={apiLoading || !apiKeyInput.trim()}>
              <RotateCw className="h-4 w-4 mr-2" />
              Rotate + Save
            </Button>
            <Button variant="destructive" onClick={handleRevokeKey} disabled={apiLoading || !activeKey}>
              Revoke Active Key
            </Button>
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <p className="text-sm font-medium">Active key metadata</p>
            {activeKey ? (
              <>
                <p className="text-sm">Version: {activeKey.version}</p>
                <p className="text-sm">Masked key: {activeKey.keyMetadata.maskedKey}</p>
                <p className="text-sm">Fingerprint: {activeKey.keyMetadata.fingerprint}</p>
                <p className="text-xs text-muted-foreground">Stored model: {activeKey.model}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No active key.</p>
            )}
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <p className="text-sm font-medium">Audit trail</p>
            {apiAuditTrail.length === 0 ? (
              <p className="text-sm text-muted-foreground">No key events logged yet.</p>
            ) : (
              apiAuditTrail.slice(0, 5).map((event, index) => (
                <p key={`${event.version}-${index}`} className="text-xs text-muted-foreground">
                  {new Date(event.createdAt).toLocaleString()} · v{event.version} · {event.action} · {event.details}
                </p>
              ))
            )}
          </div>
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Account</CardTitle>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" className="w-full text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </CardFooter>
      </Card>

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

      {/* Add Email Dialog */}
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
    </MainLayout>
  )
}
