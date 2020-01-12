const axios = require('axios');
const uuid = require('uuidv4');
const { Datastore } = require('@google-cloud/datastore');
const { PubSub } = require('@google-cloud/pubsub');

const datastore = new Datastore({
    projectId: process.env.PROJECT_ID
  });
  
  const pubsub = new PubSub({
    projectId: process.env.PROJECT_ID
  });

const BASE_URL = 'https://cmctest.dev.alohaenterprise.com/CmcRestApi/v1/';
const GROUPS_BY_COMPANY = 'company/groups/';
const SITES_BY_COMPANY_GROUP = 'company/groups/';
const SITE_DETAILS = 'site/';
const includeUpgradeStage = (upgradeStage) => {
    
    upgradeStage ? '?includeUpgradeStage=true' : ''
}

    //______________________

    const saveToDatastore = async (group, site) => {

        try {
            const query = datastore
              .createQuery('CompanyTree')
              .filter('SiteId', '=', site.SiteId)
              .order('created', { descending: true })
              .limit(1);
        
            const results = await datastore.runQuery(query);
            const prevSite = results[0].length > 0 ? results[0][0] : undefined;
        
            const key = datastore.key('CompanyTree');
        
            const newSiteUuid = uuid();
        
            const entity = {
              key: key,
              data: {
                uuid: newSiteUuid,
                created: new Date(),
                CompanyId: companyId,
                GroupId: group.GroupId,
                GroupName: group.GroupName,
                SiteCount: group.SiteCount,
                Current: group.Current,
                Critical: group.Critical,
                Upgrade: group.Upgrade,
                SiteId: site.SiteId,
                SiteName: site.SiteName,
                EnterpriseId: site.EnterpriseId,
                Address1: site.Address1,
                Address2: site.Address2,
                PhoneNumber: site.PhoneNumber,
                Online: site.Online,
                StatusCategory: site.StatusCategory,
                Current: site.Current,
                Upgrade: site.Upgrade,
                Critical: site.Critical,
                prev: prevSite ? prevSite.uuid : null,
                json: site.Devices,
              }
            };
        
            await datastore.insert(entity);
            // res.status(200).send(treeResult);
          } catch (e) {
            // console.error(`Error saving Company with id ${companyId}`);
            console.log(e)
          }
    } 
     
 
     //_______________________

  exports.catalogCompanyTree = async (event, context) => {
    const companyId = 'cti01';
    // const data = JSON.parse(Buffer.from(event.data, 'base64').toString());
    // const { companyId, sessionId, userId } = data;

    // const topic = pubsub.topic(process.env.TOPIC_NAME);
    const topic = pubsub.topic('CATALOG_COMPANRY_TREE');

    const user = {
        // userId : userId || userId.length > 0 ? userId : 'fagley.hossain@ncr.com',
        // sessionId : sessionId || sessionId.length > 0 ? sessionId : '346e9a68-da14-42de-b3a6-670d963100a7'
        userId : 'fagley.hossain@ncr.com',
        sessionId : '346e9a68-da14-42de-b3a6-670d963100a7'
    }
    let treeResult;
  try {
  
      treeResult = await companyTree(user, companyId);
      console.log('treeResult', treeResult);
    //   res.status(200).send(treeResult);
  }catch (err) {
      return null;
      
  }

  treeResult.map( (data) => {
      let group = {
        groupId: data.GroupId,
        groupName: data.GroupName,
        siteCount: data.SiteCount,
        current: data.Current,
        critical: data.Critical,
        upgrade: data.Upgrade,

      }
      data.Sites.map( (site) => {
          saveToDatastore(group,site)
      })
  })


  };

 const companyTree = async (user, companyId) => {
    const { userId, sessionId} = user;
    const options = {
      headers: {
        userId,
        sessionId,
      },
    };
  
    const url = BASE_URL + GROUPS_BY_COMPANY + companyId ;
    console.log('groups by company', url)

    let cmcCompanyGroups = null;
    try {
      cmcCompanyGroups = await axios.get(url, options);
    } catch (err) {
      return null;
    }
  
    const groups = cmcCompanyGroups.data;
  
    const siteResults = await Promise.all(groups.map(async (group) => {
      const url = BASE_URL + SITES_BY_COMPANY_GROUP + companyId + '/' +  group.Id;
      console.log('sites by company and group', url)
      try {
        const result = await axios.get(url, options);
        const group = result.data;
  
        const sites = await Promise.all(group.Sites.map(async (site) => {
          let url = BASE_URL + SITE_DETAILS + site.SiteId + '?includeUpgradeStage=true' ;
        
          console.log('site by sites', url)
          try {
            const siteResult = await axios.get(url, options);
          
            site.UpgradeStage = siteResult.data.UpgradeStage;
          } catch (err) {
            return {};
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
        console.log(err)
        return { };
      }
    }));
 
    return siteResults;
  };



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

  const upgradeStages = {
    UNDETERMINED: 'Undetermined',
    HARDWARE: 'Hardware',
    PREREQUISITES: 'Prerequisites',
    HOSTED_PRODUCTS: 'HostedProducts',
    READY: 'Ready',
    UPGRADED: 'Upgraded',
  };
  

