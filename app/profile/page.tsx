import { ProfileSettings } from "@/components/profile-settings"
import { BottomNavigation } from "@/components/bottom-navigation"
import { AuthGate } from "@/components/auth-gate"

export default function ProfilePage() {
  return (
    <AuthGate>
      <>
        <ProfileSettings />
        <BottomNavigation />
      </>
    </AuthGate>
  )
}
