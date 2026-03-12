const REPO_URL = "https://github.com/william-sy/hokkien-learning-center";

function byId(id) {
  return document.getElementById(id);
}

function initContributionLinks() {
  const issueLink = byId("issueLink");
  const prLink = byId("prLink");

  issueLink.href = `${REPO_URL}/issues/new?title=Hokkien+entry+suggestion&body=Please+share+dialect,+entry,+tone,+and+example.`;
  prLink.href = REPO_URL;
}

initContributionLinks();
