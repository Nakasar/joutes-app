import { getAllLairs } from "@/lib/db/lairs";
import Link from "next/link";
import Image from "next/image";
import { Metadata } from "next";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, ArrowRight, Gamepad2 } from "lucide-react";

export const metadata: Metadata = {
  title: 'Lieux de jeu',
  description: 'Découvrez tous les lieux de jeu et leurs événements à venir',
};

export default async function LairsPage() {
  const lairs = await getAllLairs();

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight flex items-center gap-2">
            <MapPin className="h-8 w-8 text-primary" />
            Lieux de jeu
          </h1>
          <p className="text-xl text-muted-foreground">
            Découvrez tous les lieux de jeu et leurs événements à venir
          </p>
        </div>
        
        {lairs.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <MapPin className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg text-muted-foreground">
                Aucun lieu de jeu disponible pour le moment.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {lairs.map((lair) => (
              <Link 
                key={lair.id} 
                href={`/lairs/${lair.id}`}
                className="group"
              >
                <Card className="h-full overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                  {lair.banner ? (
                    <div className="relative w-full h-48 overflow-hidden">
                      <img
                        src={lair.banner}
                        alt={lair.name}
                        className="absolute inset-0 w-full h-full object-cover object-center"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-primary/80 to-purple-600/80 flex items-center justify-center">
                      <Gamepad2 className="h-16 w-16 text-white" />
                    </div>
                  )}
                  
                  <CardHeader>
                    <CardTitle className="text-2xl group-hover:text-primary transition-colors line-clamp-2">
                      {lair.name}
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    <div className="space-y-2">
                      {lair.games.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Gamepad2 className="h-4 w-4 text-muted-foreground" />
                          <Badge variant="secondary">
                            {lair.games.length} jeu{lair.games.length > 1 ? 'x' : ''}
                          </Badge>
                        </div>
                      )}
                      {lair.address && (
                        <div className="flex items-start gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-2">{lair.address}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                  
                  <CardFooter>
                    <Button variant="ghost" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      Voir les détails
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </CardFooter>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
