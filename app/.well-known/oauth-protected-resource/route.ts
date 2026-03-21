import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://your-project.supabase.co"

const handler = protectedResourceHandler({
  authServerUrls: [`${supabaseUrl}/auth/v1`],
})

const corsHandler = metadataCorsOptionsRequestHandler()

export { handler as GET, corsHandler as OPTIONS }
