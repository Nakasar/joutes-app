"use client";

import { Button } from "@/components/ui/button";
import { setupOAuthClientAction } from "./actions";

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