/** Server-only modules ka khali stub — offline (browser-only) build me kabhi chalta nahi. */
const nope = () => {
  throw new Error("Server-only module is not available in the offline app.");
};

export const createLovableAiGatewayProvider = nope;
export const requireUserId = nope;
export const createPublicSupabase = nope;
export const getOwnerWorkspaceId = nope;
export const isActiveProfile = nope;
export const parseVyaparSheet = nope;
export const parseDelimitedText = nope;
export const buildSetupCmd = nope;
export const supabaseAdmin = new Proxy({}, { get: nope }) as never;
export const requireSupabaseAuth = {} as never;
export default {};
