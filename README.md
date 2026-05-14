# EventScan MVP

Plateforme de gestion d'événements avec génération et scan de QR codes.

## Stack
- **Frontend/Backend** : Next.js 14 (App Router)
- **Base de données** : Supabase (PostgreSQL + Auth)
- **Déploiement** : Vercel

## Fonctionnalités MVP
- Authentification admin (gestion des comptes par l'admin uniquement)
- Création et gestion d'événements
- Import invités CSV/Excel
- Génération QR code par invité
- Scan QR code via caméra smartphone (navigateur web)
- Check-in temps réel avec affichage nom + catégorie/table

## Installation locale

### 1. Cloner le repo
```bash
git clone https://github.com/mbozoomengo/eventscan.git
cd eventscan
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Variables d'environnement
Crée un fichier `.env.local` à la racine :
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXTAUTH_SECRET=your_random_secret_string
```

### 4. Configurer Supabase
- Va sur [supabase.com](https://supabase.com) et crée un projet
- Dans l'éditeur SQL de Supabase, exécute le contenu de `supabase/schema.sql`

### 5. Lancer en local
```bash
npm run dev
```
Ouvre [http://localhost:3000](http://localhost:3000)

## Déploiement Vercel
1. Push sur GitHub
2. Importe le repo sur [vercel.com](https://vercel.com)
3. Ajoute les variables d'environnement dans Vercel
4. Deploy ✅

## Structure du projet
```
eventscan/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── admin/
│   │   ├── page.tsx              # Dashboard admin
│   │   ├── users/page.tsx        # Gestion utilisateurs
│   │   └── events/page.tsx       # Tous les événements
│   ├── dashboard/
│   │   ├── page.tsx              # Dashboard organisateur
│   │   └── events/
│   │       ├── page.tsx          # Liste événements
│   │       ├── new/page.tsx      # Créer un événement
│   │       └── [id]/
│   │           ├── page.tsx      # Détail événement
│   │           ├── guests/page.tsx   # Gestion invités
│   │           └── scan/page.tsx     # Scanner QR
│   ├── invite/[token]/page.tsx   # Page publique QR invité
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── QRScanner.tsx
│   ├── GuestTable.tsx
│   └── ImportGuests.tsx
├── lib/
│   ├── supabase.ts
│   └── utils.ts
├── supabase/
│   └── schema.sql
└── .env.local (à créer)
```
