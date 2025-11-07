/**
 * Script de migration pour convertir les coordonnées des lairs
 * du format {latitude, longitude} vers le format GeoJSON Point
 * 
 * Exécutez ce script avec: npx ts-node scripts/migrate-coordinates-to-geojson.ts
 */

import db from "../lib/mongodb";

async function migrateCoordinatesToGeoJSON() {
  console.log("🚀 Début de la migration des coordonnées vers GeoJSON...");
  
  try {
    
    const lairsCollection = db.collection("lairs");
    
    // Trouver tous les lairs avec l'ancien format coordinates
    const lairsWithOldFormat = await lairsCollection.find({
      coordinates: { $exists: true }
    }).toArray();
    
    console.log(`📍 ${lairsWithOldFormat.length} lair(s) trouvé(s) avec l'ancien format coordinates`);
    
    if (lairsWithOldFormat.length === 0) {
      console.log("✅ Aucune migration nécessaire");
      return;
    }
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const lair of lairsWithOldFormat) {
      const coordinates = lair.coordinates as { latitude?: number; longitude?: number };
      
      if (coordinates.latitude !== undefined && coordinates.longitude !== undefined) {
        // Convertir au format GeoJSON
        const location = {
          type: "Point",
          coordinates: [coordinates.longitude, coordinates.latitude] // [lon, lat]
        };
        
        // Mettre à jour le document
        await lairsCollection.updateOne(
          { _id: lair._id },
          { 
            $set: { location },
            $unset: { coordinates: "" }
          }
        );
        
        migratedCount++;
        console.log(`✓ Migré: ${lair.name} (${coordinates.latitude}, ${coordinates.longitude})`);
      } else {
        skippedCount++;
        console.log(`⚠ Ignoré: ${lair.name} (coordonnées incomplètes)`);
        
        // Supprimer le champ coordinates invalide
        await lairsCollection.updateOne(
          { _id: lair._id },
          { $unset: { coordinates: "" } }
        );
      }
    }
    
    console.log(`\n✅ Migration terminée:`);
    console.log(`   - ${migratedCount} lair(s) migré(s)`);
    console.log(`   - ${skippedCount} lair(s) ignoré(s)`);
    
    // Créer l'index géospatial
    console.log("\n📐 Création de l'index géospatial 2dsphere...");
    await lairsCollection.createIndex({ location: "2dsphere" });
    console.log("✅ Index créé avec succès");
    
  } catch (error) {
    console.error("❌ Erreur lors de la migration:", error);
    throw error;
  }
}

// Exécuter la migration
migrateCoordinatesToGeoJSON()
  .then(() => {
    console.log("\n🎉 Migration complétée avec succès");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ La migration a échoué:", error);
    process.exit(1);
  });
