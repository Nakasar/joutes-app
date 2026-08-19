"use client";

import { Button } from "@/components/ui/button.tsx";
import { setupOAuthClientAction } from "./actions.ts";

export default function AdminSetupPage() {
    return (
        <div>
            <div>Admin Setup Page</div>

            <div>
                <Button
                    onClick={async () => {
                        await setupOAuthClientAction();
                    }}
                >
                    Add initial Oauth Client
                </Button>
            </div>
        </div>
    );
}