const SUPABASE_URL = "https://dddxjwoptvlcynyobppv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZHhqd29wdHZsY3lueW9icHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MTA3MjQsImV4cCI6MjA5MjE4NjcyNH0.h8sqLAU_4n57PqY0vwnwvBXBstS9uRon0-d0MXY6tm4";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  },
});

const getCurrentUser = () => {
  const storedUser = localStorage.getItem("ticketgen_user");
  if (!storedUser) {
    return null;
  }
  try {
    return JSON.parse(storedUser);
  } catch (error) {
    return null;
  }
};

const ensureUserInDb = async (user) => {
  if (!user?.sub) {
    return { data: null, error: "missing_sub" };
  }

  const payload = {
    google_sub: user.sub,
    email: user.email ?? null,
    full_name: user.name ?? null,
    avatar_url: user.picture ?? null,
  };

  const { data, error } = await supabaseClient
    .from("users")
    .upsert(payload, { onConflict: "google_sub" })
    .select()
    .single();

  if (error) {
    console.error("Error al guardar usuario en Supabase:", error.message);
    return { data: null, error: error.message };
  }

  return { data, error: null };
};

window.supabaseClient = supabaseClient;
window.getCurrentUser = getCurrentUser;
window.ensureUserInDb = ensureUserInDb;
