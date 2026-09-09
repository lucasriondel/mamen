import type { AiProvider, SecretStatus } from "@mamen/shared/contract";
import { AI_PROVIDER_LABELS, AI_PROVIDERS } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CredentialGrid, CredentialTile } from "@/components/ui/credential-tile";
import { aiTaskKeys, secretKeys, secretMutations } from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";
import { CREDENTIAL_KIND, CREDENTIAL_SOURCE, credentialFieldLabel } from "./copy";

/**
 * The credentials half of the AI settings page — one tile per provider in
 * catalogue order, each showing whether a credential is stored and offering the
 * field to store one.
 *
 * The tile is gousse's, vendored (ADR 0003) rather than reimplemented: it was
 * built for this screen, and its {@link SecretField} is write-only by design —
 * the value it holds is the *draft being typed*, never a stored one. A
 * credential component with a "current value" is already a leak, so the stored
 * side of the tile shows the masked hint and nothing else. This module never
 * receives a stored value either: the whole outward vocabulary is
 * `SecretStatus`, a boolean and a hint (ADR 0011).
 *
 * The list is driven by `AI_PROVIDERS`, not by the rows the server has — an
 * absent credential is an answer to "what are my options", and rendering only
 * the configured ones would hide every provider the user could switch to.
 * `GET /secrets` answers exhaustively for the same reason, so the lookup below
 * is a safety net for a provider added to the catalogue ahead of the API.
 */
export function CredentialsGrid({
  statuses,
  loading,
}: {
  statuses: ReadonlyArray<SecretStatus>;
  loading: boolean;
}) {
  const queryClient = useQueryClient();

  /**
   * The drafts being typed, per provider. Local and deliberately never
   * persisted: a draft is a secret in flight, and the moment it is stored the
   * entry is dropped rather than left holding the value that was just sent.
   */
  const [drafts, setDrafts] = useState<Partial<Record<AiProvider, string>>>({});

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: secretKeys.all }),
      // A credential appearing or disappearing changes which providers a task
      // may be pointed at, so the picker below is stale the moment this lands.
      queryClient.invalidateQueries({ queryKey: aiTaskKeys.all }),
    ]);

  const save = useMutation({
    mutationFn: ({ provider, value }: { provider: AiProvider; value: string }) =>
      secretMutations.put(provider, value),
    onSuccess: (_status, { provider }) => {
      // Drop the draft before the refetch lands: it is the value that was just
      // stored, and nothing on this page should still be holding it.
      setDrafts((current) => ({ ...current, [provider]: "" }));
      return invalidate();
    },
  });

  const clear = useMutation({
    mutationFn: (provider: AiProvider) => secretMutations.clear(provider),
    onSuccess: invalidate,
  });

  const statusOf = (provider: AiProvider) => statuses.find((entry) => entry.name === provider);

  /**
   * The refusal to show on this tile, or `null` — never another tile's.
   *
   * There is one mutation behind four tiles and `useMutation` carries one error
   * at a time, so which tile a refusal belongs to is read back off `variables`
   * rather than assumed. Without that, refusing a paste into Anthropic would
   * light up OpenAI's tile too, and the user would go and check the wrong key.
   */
  const errorOn = (provider: AiProvider) => {
    if (save.error && save.variables?.provider === provider) {
      return toErrorMessage(save.error);
    }
    if (clear.error && clear.variables === provider) {
      return toErrorMessage(clear.error);
    }
    return null;
  };

  return (
    <CredentialGrid>
      {AI_PROVIDERS.map((provider) => {
        const status = statusOf(provider);
        const label = AI_PROVIDER_LABELS[provider];

        return (
          <CredentialTile
            key={provider}
            provider={provider}
            label={label}
            kind={CREDENTIAL_KIND[provider]}
            configured={status?.configured ?? false}
            hint={status?.hint ?? null}
            loading={loading}
            draft={drafts[provider] ?? ""}
            onDraftChange={(value) => setDrafts((current) => ({ ...current, [provider]: value }))}
            onSave={() => save.mutate({ provider, value: drafts[provider] ?? "" })}
            onClear={() => clear.mutate(provider)}
            saving={save.isPending && save.variables?.provider === provider}
            clearing={clear.isPending && clear.variables === provider}
            error={errorOn(provider)}
            fieldLabel={credentialFieldLabel(provider)}
            placeholder={CREDENTIAL_KIND[provider]}
            footnote={CREDENTIAL_SOURCE[provider]}
          />
        );
      })}
    </CredentialGrid>
  );
}
