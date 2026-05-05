# Circle of Health — website

Één-pagina website voor Circle of Health. Gebouwd met plain HTML, CSS en vanilla JavaScript. Werkt direct op GitHub Pages.

---

## Bestanden

| Bestand | Omschrijving |
|---|---|
| `index.html` | De volledige website |
| `style.css` | Alle stijlen |
| `app.js` | JavaScript: content laden/opslaan, edit mode, contactformulier |
| `firebase-config.js` | **Jouw Firebase-sleutels** (zie stap 1 hieronder) |

---

## Stap 1 — Firebase project aanmaken

1. Ga naar [console.firebase.google.com](https://console.firebase.google.com) en maak een nieuw project aan.
2. Klik op **Project-instellingen** (tandwiel) → **Jouw apps** → **Web-app toevoegen** (`</>`).
3. Kopieer het `firebaseConfig`-object en vul de waarden in in `firebase-config.js`:

```js
const FIREBASE_CONFIG = {
  apiKey:            "AIza...",
  authDomain:        "mijn-project.firebaseapp.com",
  projectId:         "mijn-project",
  storageBucket:     "mijn-project.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123...:web:abc..."
};
```

---

## Stap 2 — Firebase services activeren

### Firestore
1. Ga in de Firebase Console naar **Firestore Database** → **Database aanmaken**.
2. Kies **Productie-modus** (we stellen rules in stap 3 in).
3. Kies een regio (bijv. `europe-west1`).

### Storage
1. Ga naar **Storage** → **Aan de slag**.
2. Kies ook hier **Productie-modus**.
3. Gebruik dezelfde regio als Firestore.

---

## Stap 3 — Security Rules

### Firestore rules
Ga naar **Firestore → Rules** en plak:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Iedereen mag berichten sturen (contactformulier)
    match /messages/{id} {
      allow create: if request.resource.data.keys().hasAll(['name','email','message','createdAt'])
                    && request.resource.data.name is string
                    && request.resource.data.email is string
                    && request.resource.data.message is string;
      allow read, update, delete: if false;
    }

    // Site-content: publiek leesbaar, schrijven alleen met juist wachtwoord-header
    // Omdat we geen Firebase Auth gebruiken, beveiligen we via een geheim veld:
    match /content/site {
      allow read: if true;
      // Schrijven alleen als het request het geheime token bevat
      // Implementeer Firebase Authentication (anoniem of e-mail) voor productie
      allow write: if request.auth != null;
    }
  }
}
```

> **Opmerking:** Voor de eenvoudigste setup mag je `allow write: if true;` gebruiken als de URL `?edit=true` + wachtwoord-prompt voldoende bescherming biedt voor jouw situatie. Wil je het strenger, activeer dan **Firebase Anonymous Authentication** en log de gebruiker in na het wachtwoord-check in `app.js`.

### Storage rules
Ga naar **Storage → Rules** en plak:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /images/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
      // Of voor de eenvoudigste setup:
      // allow write: if true;
    }
  }
}
```

---

## Stap 4 — Wachtwoord aanpassen

Open `app.js` en zoek bovenaan:

```js
const EDIT_PASSWORD = 'circleofhealth2025';
```

Vervang dit door een sterk wachtwoord naar keuze.

---

## Stap 5 — Deployen op GitHub Pages

1. Push alle bestanden naar de `main`-branch van jouw GitHub-repository.
2. Ga naar **Settings → Pages** → kies **Branch: main**, map **/ (root)**.
3. GitHub Pages publiceert de site binnen een minuut.

> Omdat `app.js` als ES-module is geladen (`type="module"`), werkt alles direct — geen build-stap nodig.

---

## Edit mode gebruiken

- Navigeer naar `https://jouwsite.github.io/?edit=true`
- Voer het wachtwoord in
- Klik op teksten om ze te bewerken; klik op foto-zones om afbeeldingen te uploaden
- Wijzigingen worden automatisch opgeslagen in Firebase
- Klik op het logo-uploadzone in de header om een logo-afbeelding te plaatsen

---

## Collecties in Firestore

| Collectie | Document | Inhoud |
|---|---|---|
| `content` | `site` | Alle tekstvelden en foto-URLs |
| `messages` | *(auto-id)* | Contactformulier-berichten |
