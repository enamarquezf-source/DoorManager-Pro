export function mustProtectOwnAccount(actorId: string | undefined, editedUserId: string) {
  return !actorId || actorId === editedUserId;
}
