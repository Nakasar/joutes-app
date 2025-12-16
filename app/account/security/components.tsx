'use client';

import {Button} from "@/components/ui/button";
import {Key} from "lucide-react";
import {authClient} from "@/lib/auth-client";

export function AddPassKeyButton() {
  return (
    <Button onClick={async () => {
      const { data, error } = await authClient.passkey.addPasskey({
        name: "apple-passkey",
      });
    }}>
      <Key />
      Ajouter une clé de connexion
    </Button>
  )
}