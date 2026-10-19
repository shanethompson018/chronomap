/* Deployment settings. These values are public by design (a browser app cannot keep secrets);
 * the Google client ID only tells Google which app is asking for permission, and Google only
 * honours it from the web addresses registered for it (the GitHub Pages site and localhost). */
window.ChronoConfig = {
  // Google Cloud project "Chronomap" (chronomap-512104), OAuth client "Chrono Map web"
  googleClientId: '790019515261-rum4laogsd21vho8e0efqso6fk0vn653.apps.googleusercontent.com',
  // Only files the app creates itself are visible to it.
  googleScopes: 'https://www.googleapis.com/auth/drive.file',
  // Name of the folder the app keeps in your Google Drive.
  driveFolderName: 'Chrono Map',
};
