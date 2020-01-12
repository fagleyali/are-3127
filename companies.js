const axios = require('axios');
const { PubSub } = require('@google-cloud/pubsub');

const pubSub = new PubSub({
  projectId: process.env.PROJECT_ID,
});

// const companyGroups = async (companyId, userId, sessionId) => {
//   let response = null;
//   const config = {
//     method: 'get',
//     url: `https://cmctest.dev.alohaenterprise.com/CmcRestApi/v1/company/groups/${companyId}`,
//     headers: {
//       'Accept': 'application/json',
//       'userId': userId,
//       'sessionId': sessionId,
//     },
//   };

//   try {
//     response = await axios(config);
//   } catch (e) {
//     return null;
//   }

//   return response.data;
// }

// const companySites = async (companyId, groupId) => {
//   const config = {
//     method: 'get',
//     url: `https://cmctest.dev.alohaenterprise.com/CmcRestApi/v1/company/groups/${companyId}/${groupId}`,
//     headers: {
//       'Accept': 'application/json',
//       'userId': userId,
//       'sessionId': sessionId,
//     },
//   };
// }

// const siteDetails = async (siteId) => {
//   const config = {
//     method: 'get',
//     url: `https://cmctest.dev.alohaenterprise.com/CmcRestApi/v1/site/${siteId}?includeUpgradeStage=true`,
//     headers: {
//       'Accept': 'application/json',
//       'userId': userId,
//       'sessionId': sessionId,
//     },
//   };
// }

function getSiteStatusCounts(group) {
  const statuses = {
    Current: 0,
    Critical: 0,
    Upgrade: 0,
  };

  group.Sites.forEach(site => {
    if(site.UpgradeStage === upgradeStages.UPGRADED) {
      statuses.Current++;
      site.StatusCategory = 'Current';
      site.Current = true;
      site.Upgrade = false;
      site.Critical = false;
    }
    if(site.UpgradeStage === upgradeStages.HOSTED_PRODUCTS
      || site.UpgradeStage === upgradeStages.READY) {
      statuses.Upgrade++;
      site.StatusCategory = 'Upgrade';
      site.Current = false;
      site.Upgrade = true;
      site.Critical = false;
    }
    if(site.UpgradeStage === upgradeStages.UNDETERMINED ||
      site.UpgradeStage === upgradeStages.HARDWARE ||
      site.UpgradeStage === upgradeStages.PREREQUISITES) {
      statuses.Critical++;
      site.StatusCategory = 'Critical';
      site.Current = false;
      site.Upgrade = false;
      site.Critical = true;
    }
    return site;
  });

  return statuses;
}

const buildSiteTree = async (companyId, userId, sessionId) => {
  const options = {
    headers: {
      userId,
      sessionId,
    },
  };

  const companyGroupUrl = `https://cmctest.dev.alohaenterprise.com/CmcRestApi/v1/company/groups/${companyId}`;

  let cmcCompanyGroups = null;
  try {
    cmcCompanyGroups = await axios.get(companyGroupUrl, options);
  } catch (err) {
    return null;
  }

  const groups = cmcCompanyGroups.data;

  const siteResults = await Promise.all(groups.map(async (group) => {
    const companyGroupSitesUrl = `https://cmctest.dev.alohaenterprise.com/CmcRestApi/v1/company/groups/${companyId}/${group.Id}`;
    console.log('companyGroupSitesUrl', companyGroupSitesUrl);


    try {
      const result = await axios.get(companyGroupSitesUrl, options);
      console.log('---1');

      const group = result.data;

      const sites = await Promise.all(group.Sites.map(async (site) => {
        let siteDetailUrl = `https://cmctest.dev.alohaenterprise.com/CmcRestApi/v1/site/${site.SiteId}?includeUpgradeStage=true`;
        console.log('siteDetailUrl', siteDetailUrl);


        try {
          const siteResult = await axios.get(siteDetailUrl, options);
          site.UpgradeStage = siteResult.data.UpgradeStage;
        } catch (err) {
          console.log('error 2');

          return { };
        }

        return site;
      }));

      group.Sites = sites;
      group.Sites.sort((a, b) => {
        return a.SiteName.toLowerCase() > b.SiteName.toLowerCase() ? 1 : -1;
      });

      const statuses = getSiteStatusCounts(group);
      return {
        ...group,
        ...statuses,
      };
    } catch (err) {
      console.log(' error 1');

      return { };
    }
  }));

  return siteResults;
  
};

exports.catalogCompanyTree = async (req, res) => {
  // const data = JSON.parse(Buffer.from(event.data, 'base64').toString());
  // const { companyId, sessionId, userId } = data;
  const companyId = 'cti01';
//   const userId = 'grant.vanhorn@tinroofsoftware.com';
//   const sessionId = 'dc99d756-0304-4940-96fa-66e40d10c3c8';
    const userId  = req.user.userId;
    const sessionId = req.user.sessionId;
try {

    const treeResult = await buildSiteTree(companyId, userId, sessionId);
    return('treeResult', treeResult);
    res.status(200).send(treeResult);
}catch (err) {
    return null;
    
}

};
