import * as path from 'path';
import * as dotenv from 'dotenv';

// Exécuté par Jest (setupFiles) avant chaque worker de test — charge
// .env.test AVANT que AppModule (ConfigModule.forRoot) ne charge son propre
// .env par défaut. dotenv ne réécrit jamais une variable déjà présente dans
// process.env, donc ces valeurs de test gagnent toujours.
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });
