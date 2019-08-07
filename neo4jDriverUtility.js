const neo4j = require('neo4j-driver').v1;

//import config file for database
const neoConfig = require('./database_config/config.json');

// import static strings
const messages = require('./resource_config/static_content.json');

//import serializer to serialize for visJS format
const serializer = require('./utility/serializer');
const serializerv2 = require('./utility/serializerv2');
const labelSerializer = require('./utility/labelSerializer/labelSerializer');

// import data utility to process data
const dataUtility = require('./utility/dataUtility');

const { user, password } = neoConfig;

let neo4Jdriver;
var session;

var runQuery = (query) => {
    if (query) {
        if (!!query.length) {
            return session.run(query);
        }
    } else {
        console.error('Empty query passed');
        throw Error;
    }
}

var initiate = () => {
    if (!user) {
        console.error('No User provided, make sure you have entered the user in database_config/config.json --->', user);
    } else if (!password) {
        neo4Jdriver = neo4j.driver(neoConfig.url, neo4j.auth.basic(neoConfig.user, ''))
    } else {
        neo4Jdriver = neo4j.driver(neoConfig.url, neo4j.auth.basic(neoConfig.user, neoConfig.password))
    }
    session = neo4Jdriver.session();
}

var getMetaData = () => {
    let queryForNodes = 'match (p) -[r]-> (q) return count(p), p';
    let queryForRelationships = 'match (p) -[r]-> (q) return count(r), r';
    let dataToReturn = {
        Nodes: {},
        Relationships: {}
    }
    return runQuery(queryForNodes)
        .then(result => {
            let final = processMetaData({ result, type: 'node' });
            dataToReturn.Nodes = final;
            // now ge the meta data of relationship
            return runQuery(queryForRelationships)
        })
        .then(relationshipResult => {
            let final = processMetaData({ result: relationshipResult, type: 'relationship' });
            dataToReturn.Relationships = final;
            neo4Jdriver.close();
            return new Promise((res, rej) => {
                if (dataToReturn.constructor !== Object) {
                    rej('Nothing recieved on processing the metaData');
                } else {
                    //send data back
                    res(dataToReturn);
                }
            });
        })
        .catch(err => {
            console.log('an error occured while retrieving metadata for nodes', err);
            neo4Jdriver.close();
        });
}

function processMetaData(dataToProcess) {
    if (dataToProcess.constructor === Object) {
        //data is an object
        if (dataToProcess.hasOwnProperty('result') && dataToProcess.hasOwnProperty('type')) {
            if (dataToProcess.type === 'node') {
                // process node
                let NodeData = dataToProcess.result;
                if (NodeData.hasOwnProperty('records')) {
                    if (NodeData.records.length > 0) {
                        let DATA = NodeData.records.map(node => {
                            return node._fields[1];
                        });
                        // add total count
                        let finalDATA = {
                            count: DATA.length,
                            data: DATA
                        }
                        return finalDATA;
                    } else {
                        // empty records
                        return null;
                    }
                } else {
                    // no records key found inside the data object , it should be there as the neo4J returns it
                    return null;
                }
            }



            if (dataToProcess.type === 'relationship') {
                // process relationships
                let relationshipData = dataToProcess.result;
                if (relationshipData.hasOwnProperty('records')) {
                    if (relationshipData.records.length > 0) {
                        let DATA = relationshipData.records.map(relationship => {
                            return relationship._fields[1];
                        });
                        // add total count
                        let finalDATA = {
                            count: DATA.length,
                            data: DATA
                        }
                        console.log('Total nodes returned are ', finalDATA);
                        return finalDATA;
                    } else {
                        // empty records
                        return null;
                    }
                } else {
                    // no records key found inside the data object , it should be there as the neo4J returns it
                    return null;
                }
            }
        } else {
            //invalid format of data provided
            return null;
        }
    } else {
        //entered data is not an object
        return null;
    }
}

var getData = (query) => {
    if (!query || query.length <= 0) {
        query = neoConfig.initial_query
    }
    return runQuery(query)
        .then(result => {
            let serializedData = serializer.Neo4JtoVisFormat(JSON.stringify(result.records));
            console.log('serialized data is ', serializedData.seperateNodes.length, serializedData.seperateEdges.length);
            neo4Jdriver.close();
            return new Promise((res, rej) => {
                if (serializedData.seperateNodes.length > 0 || serializedData.seperateEdges.length > 0) {
                    console.log('successfully returining the request');
                    res(serializedData);
                } else {
                    console.log('error while returning data');
                    rej('Both are empty in serialized data');
                }
            });
        })
        .catch(err => {
            console.log('an error occured while retrieving', err);
            neo4Jdriver.close();
        });
}

function createProperString(data) {
    return data.map(d => `'${d}'`).join(',');

}

function createProperStringArray(data) {
    return data.map(d => `['${d}']`).join(',');

}

function createProperRelationString(data, delimiter = '|') {
    return data.map(s => `:\`${s}\``).join(delimiter);
}

function runQueryWithTypes(dataObj) {
    // check if the object is empty---> return error if it is
    if (dataObj.constructor === Object) {
        dataObj.relation = createProperRelationString(dataObj.relation);
        if (dataObj.length === 1) {
            dataObj.nodes[0].value = createProperString(dataObj.nodes[0].value);
            let queryStatement = '';
            if (!!dataObj.relation) {
                queryStatement = `match (p:${dataObj.nodes[0].type}) <-[r${dataObj.relation}]->(q) where p.Name IN [${dataObj.nodes[0].value}] return p,q,r`;
            } else {
                queryStatement = queryStatement = `match (p:${dataObj.nodes[0].type}) <-[r]->(q) where p.Name IN [${dataObj.nodes[0].value}] return p,q,r`;
            }
            console.log('query for 1 node type is ', queryStatement);
            return runQuery(queryStatement).then(result => {
                let serializedData = serializer.Neo4JtoVisFormat(JSON.stringify(result.records));
                return new Promise((resolve, reject) => {
                    resolve(serializedData);
                });
            }).catch(err => {
                console.log('An error occured while runnning the query', err);
                return new Promise((resolve, reject) => {
                    reject('API : get/data | ERROR : Error encountered while reading from database');
                });
            });
        } else if (dataObj.length === 2) {
            dataObj.nodes.forEach(node => {
                node.value = createProperString(node.value);
            });
            let queryStatement = '';
            if (!!dataObj.relation) {
                queryStatement = `match (p:${dataObj.nodes[0].type})-[r${dataObj.relation}]-(q:${dataObj.nodes[1].type})
                where p.Name IN [${dataObj.nodes[0].value}] and q.Name IN [${dataObj.nodes[1].value}] return p,q,r`;
            } else {
                queryStatement = `match (p:${dataObj.nodes[0].type}) <-[r]->(q:${dataObj.nodes[1].type}) 
                where p.Name IN [${dataObj.nodes[0].value}]
                and q.Name IN [${dataObj.nodes[1].value}] return p,q,r`;
            }
            console.log('query is ', queryStatement);

            return runQuery(queryStatement).then(result => {
                let serializedData = serializer.Neo4JtoVisFormat(JSON.stringify(result.records));
                return new Promise((resolve, reject) => {
                    resolve(serializedData);
                });
            }).catch(err => {
                console.log('An error occured while runnning the query', err);
                return new Promise((resolve, reject) => {
                    reject('API : get/data | ERROR : Error encountered while reading from database with 2 types');
                });
            });
        } else if (dataObj.length === 3) {
            dataObj.nodes.forEach(node => {
                node.value = createProperString(node.value);
            });
            let queryStatement
            if (!dataObj.relation) {
                queryStatement = `match (p:${dataObj.nodes[0].type}) <-[r]->(q:${dataObj.nodes[1].type}) <-[s]->(t:${dataObj.nodes[2].type}) 
                where p.Name IN [${dataObj.nodes[0].value}]
                and q.Name IN [${dataObj.nodes[1].value}] and t.Name IN [${dataObj.nodes[2].value}] return p,q,r,t,s`;
            } else {
                queryStatement = `match (p:${dataObj.nodes[0].type}) <-[r${dataObj.relation}]->(q:${dataObj.nodes[1].type}) <-[s${dataObj.relation}]->(t:${dataObj.nodes[2].type}) 
                where p.Name IN [${dataObj.nodes[0].value}]
                and q.Name IN [${dataObj.nodes[1].value}] and t.Name IN [${dataObj.nodes[2].value}] return p,q,r,t,s`;
            }
            console.log('query is ', queryStatement);

            return runQuery(queryStatement).then(result => {
                let serializedData = serializer.Neo4JtoVisFormat(JSON.stringify(result.records));
                return new Promise((resolve, reject) => {
                    resolve(serializedData);
                });
            }).catch(err => {
                console.log('An error occured while runnning the query', err);
                return new Promise((resolve, reject) => {
                    reject('API : get/data | ERROR : Error encountered while reading from database with 3 types');
                });
            });

        } else {
            //this will work in case user sends only relationships
            let queryStatement = '';
            if (!dataObj.relation) {
                queryStatement = `match (p) <-[r]->(q) return p,q,r`;
            } else {
                queryStatement = `match (p) <-[r${dataObj.relation}]->(q) return p,q,r`;
            }
            console.log('query for 0 node type is ', queryStatement);

            return runQuery(queryStatement).then(result => {
                let serializedData = serializer.Neo4JtoVisFormat(JSON.stringify(result.records));
                return new Promise((resolve, reject) => {
                    resolve(serializedData);
                });
            }).catch(err => {
                console.log('An error occured while runnning the query', err);
                return new Promise((resolve, reject) => {
                    reject('API : get/data | ERROR : Error encountered while reading from database with 0 types');
                });
            });

        }



    } else {

    }
}

var getGraphData = (req) => {
    let relationshipTypesArray = [];

    if (req.body.hasOwnProperty('edges') && req.body.edges.length > 0) {
        // data for edges / relationships is present, get all the relevant information
        req.body.edges.filter(edge => {
            if (edge.hasOwnProperty('type') && edge.type.length > 0) {
                relationshipTypesArray.push(edge.type);
                return true;
            } else {
                // did not get the type key in the current edge
                console.log(`API : graph/data | WARNING : The given edge ${JSON.stringify(edge)} has no property type\n`);
            }
        });
        console.log(`Edge types are ${relationshipTypesArray}\n`);
    }
    // process nodes and edges in the given format
    // 1. find all the types of nodes needed for the query
    if (req.body.hasOwnProperty('nodes') && req.body.nodes.length >= 0) {
        // data for nodes is present, get all the relevant information
        if (req.body.nodes.length == 1) {
            return runQueryWithTypes({ relation: relationshipTypesArray, nodes: req.body.nodes, length: 1 });
        } else if (req.body.nodes.length == 2) {
            return runQueryWithTypes({ relation: relationshipTypesArray, nodes: req.body.nodes, length: 2 })
        } else if (req.body.nodes.length === 3) {
            return runQueryWithTypes({ relation: relationshipTypesArray, nodes: req.body.nodes, length: 3 })
        } else {
            return runQueryWithTypes({ relation: relationshipTypesArray, nodes: req.body.nodes, length: 0 })
        }
    } else {
        return new Promise((resolve, reject) => {
            // send back the data 
            reject('No nodes provided in the body');
        });
    }
}

var searchQuery = (requestBody, raw = false) => {
    // all the cross verification has been done earlier, now it is sure to have a query key
    let queryToExecute = requestBody.query;
    return runQuery(queryToExecute).then(result => {
        let serializedData;
        if (raw) {
            console.log('raw request\n');
            serializedData = result.records;
        } else {
            serializedData = serializer.Neo4JtoVisFormat(JSON.stringify(result.records));
        }
        return new Promise((resolve, reject) => {
            resolve(serializedData);
        });
    }).catch(err => {
        console.log('An error occured while runnning the query', err);
        return new Promise((resolve, reject) => {
            if (raw) {
                return resolve({ err, message: err.message });
            }
            reject('API : get/data | ERROR : Error encountered while reading from database');
        });
    });

}
var getDataV2 = (query) => {
    if (!query || query.length <= 0) {
        query = neoConfig.initial_query_v2
    }
    return runQuery(query)
        .then(result => {
            let serializedData = serializerv2.Neo4JtoVisFormat(JSON.stringify(result.records));
            console.log('serialized data is ', serializedData.seperateNodes.length, serializedData.seperateEdges.length);
            neo4Jdriver.close();
            return new Promise((res, rej) => {
                if (serializedData.seperateNodes.length > 0 || serializedData.seperateEdges.length > 0) {
                    console.log('successfully returining the request');
                    res(serializedData);
                } else {
                    console.log('error while returning data');
                    rej('Both are empty in serialized data');
                }
            });
        })
        .catch(err => {
            console.log('an error occured while retrieving', err);
            neo4Jdriver.close();
        });
}
var getGraphDataV2 = (req) => {
    let relationshipTypesArray = [];

    if (req.body.hasOwnProperty('edges') && req.body.edges.length > 0) {
        // data for edges / relationships is present, get all the relevant information
        req.body.edges.filter(edge => {
            if (edge.hasOwnProperty('type') && edge.type.length > 0) {
                relationshipTypesArray.push(edge.type);
                return true;
            } else {
                // did not get the type key in the current edge
                console.log(`API : graph/data | WARNING : The given edge ${JSON.stringify(edge)} has no property type\n`);
            }
        });
        console.log(`Edge types are ${relationshipTypesArray}\n`);
    }
    // process nodes and edges in the given format
    // 1. find all the types of nodes needed for the query
    if (req.body.hasOwnProperty('nodes') && req.body.nodes.length >= 0) {
        // data for nodes is present, get all the relevant information
        if (req.body.nodes.length == 1) {
            return runQueryWithTypesV2({ relation: relationshipTypesArray, nodes: req.body.nodes, length: 1, limit: req.body.limit });
        } else if (req.body.nodes.length == 2) {
            return runQueryWithTypesV2({ relation: relationshipTypesArray, nodes: req.body.nodes, length: 2, limit: req.body.limit })
        } else if (req.body.nodes.length === 3) {
            return runQueryWithTypesV2({ relation: relationshipTypesArray, nodes: req.body.nodes, length: 3, limit: req.body.limit })
        } else {
            return runQueryWithTypesV2({ relation: relationshipTypesArray, nodes: req.body.nodes, length: 0, limit: req.body.limit })
        }
    } else if (req.body.hasOwnProperty('limit')) {
        return limitBasedInitGraphShow({ limit: req.body.limit });
    } else {
        return new Promise((resolve, reject) => {
            // send back the data 
            reject('No nodes provided in the body');
        });
    }
}


function createSubQuery(node) {
    let query = `q.\`${node["type"]}\` in [${node.value}]`;
    return query;
}

function joinSubQuery(allSubQuery) {
    return allSubQuery.join(' and ');
}

function getLimit(limit) {
    if (!limit || limit === "") {
        return neoConfig.default_node_limit;
    } else {
        return limit;
    }
}

function runQueryWithTypesV2(dataObj) {
    // check if the object is empty---> return error if it is
    if (dataObj.constructor === Object) {
        let allSubQuery = [];
        let typeArray = [];
        dataObj.relation = createProperRelationString(dataObj.relation);
        if (dataObj) {
            if (dataObj.limit) {
                dataObj.limit = getLimit(dataObj.limit);
            }
            if (dataObj.nodes.length > 0) {
                // dataObj.nodes[0].value = createProperString(dataObj.nodes[0].value);
                // dataObj.nodes[2].value = createProperString(dataObj.nodes[2].value);
                // dataObj.nodes[3].value = createProperString(dataObj.nodes[3].value);
                // dataObj.nodes[4].value = createProperString(dataObj.nodes[4].value);
                // dataObj.nodes[5].value = createProperString(dataObj.nodes[5].value);

                dataObj.nodes.forEach(node => {
                    if (node["type"] === "Type") {
                        // node.value = createProperStringArray(node.value);
                        typeArray = node.value;
                    } else {
                        node.value = createProperString(node.value);
                        allSubQuery.push(createSubQuery(node));
                    }
                });
                if (typeArray.length > 0) {
                    typeArray = createProperStringArray(typeArray);
                }
                if (allSubQuery.length > 0) {
                    allSubQuery = joinSubQuery(allSubQuery);
                }
            }
            let queryStatement = '';
            if (!!dataObj.relation && dataObj.nodes.length > 0) {
                queryStatement = `match (p)-[r${dataObj.relation}]-(q) where labels(p) In [${dataObj.nodes[1].value}] or p.Name IN [${dataObj.nodes[0].value}] or p.Connection IN [${dataObj.nodes[2].value}] or p.Represent in [${dataObj.nodes[3].value}] or p.Status in [${dataObj.nodes[4].value}] or p.\`Understanding of SP Thinking\` in [${dataObj.nodes[5].value}] return p,r,q limit 50`;
                if (dataObj.nodes.length == 1) {
                    if (dataObj.nodes[0].type === "Name") {
                        queryStatement = `match (p)-[r${dataObj.relation}]-(q) where p.Name IN [${dataObj.nodes[0].value}] return p,r,q limit 50`;
                    } else if (dataObj.nodes[0].type === "Type") {
                        dataObj.nodes[0].value = createProperStringArray(dataObj.nodes[0].value);
                        queryStatement = `match (p)-[r${dataObj.relation}]-(q) where labels(p) In [${dataObj.nodes[0].value}] return p,r,q limit 50`;
                    }
                } else if (dataObj.nodes.length == 2) {
                    dataObj.nodes[1].value = createProperStringArray(dataObj.nodes[1].value);
                    queryStatement = `match (p {Name:"Societal Platform Team"})-[r${dataObj.relation}]-(q) where labels(q) In [${dataObj.nodes[1].value}] and q.Name IN [${dataObj.nodes[0].value}] return p,r,q limit 50`;
                }
            } else if (!!dataObj.relation) {
                queryStatement = `match (p {Name:"Societal Platform Team"}) <-[r${dataObj.relation}]->(q) where p.deleted = "false" and r.deleted = "false" and q.deleted = "false" return p,q,r limit ${dataObj.limit}`;
            } else if (typeArray.length > 0) {
                // queryStatement = `match (p)-[r]-(q) where labels(p) In [${dataObj.nodes[1].value}] p.Name IN [${dataObj.nodes[0].value}] or p.Connection IN [${dataObj.nodes[2].value}] or p.Represent in [${dataObj.nodes[3].value}] or p.Status in [${dataObj.nodes[4].value}] or p.\`Understanding of SP Thinking\` in [${dataObj.nodes[5].value}] return p,r,q limit 50`;
                if (allSubQuery.length > 0) {

                    //queryStatement = `match (p {Name:"Societal Platform Team"})-[r]-(q) where labels(q) In [${typeArray}] and ${allSubQuery} and p.deleted = false and r.deleted = false and q.deleted = false return p,r,q limit ${dataObj.limit}`;
                    queryStatement = `match (p)-[r]-(q) where labels(q) In [${typeArray}] and ${allSubQuery} and p.deleted = "false" and r.deleted = "false" and q.deleted = "false" and not q.Name in ["Societal Platform Team"] return p,r,q limit ${dataObj.limit}`;
                } else {
                    //queryStatement = `match (p {Name:"Societal Platform Team"})-[r]-(q) where labels(q) In [${typeArray}] and p.deleted = false and r.deleted = false and q.deleted = false return p,r,q limit ${dataObj.limit}`;
                    queryStatement = `match (p)-[r]-(q) where labels(q) In [${typeArray}] and p.deleted = "false" and r.deleted = "false" and q.deleted = "false" and not q.Name in ["Societal Platform Team"] return p,r,q limit ${dataObj.limit}`;
                }

            } else {
                queryStatement = `match (p {Name:"Societal Platform Team"})-[r]-(q) where ${allSubQuery} and p.deleted = "false" and r.deleted = "false" and q.deleted = "false" return p,r,q limit ${dataObj.limit}`;
            }
            console.log('query for 1 node type is ', queryStatement);
            return runQuery(queryStatement).then(result => {
                let serializedData = serializer.Neo4JtoVisFormat(JSON.stringify(result.records));
                return new Promise((resolve, reject) => {
                    resolve(serializedData);
                });
            }).catch(err => {
                console.log('An error occured while runnning the query', err);
                return new Promise((resolve, reject) => {
                    reject('API : get/data | ERROR : Error encountered while reading from database');
                });
            });
        } else if (dataObj.length === 2) {
            dataObj.nodes.forEach(node => {
                node.value = createProperString(node.value);
            });
            let queryStatement = '';
            if (!!dataObj.relation) {
                queryStatement = `match (p:${dataObj.nodes[0].type})-[r${dataObj.relation}]-(q:${dataObj.nodes[1].type})
                where p.Name IN [${dataObj.nodes[0].value}] and q.Name IN [${dataObj.nodes[1].value}] return p,q,r`;
            } else {
                queryStatement = `match (p:\`${dataObj.nodes[0].type}\`) where p.Name IN [${dataObj.nodes[0].value}]
                or p.Type IN [${dataObj.nodes[1].value}] return p`;
            }
            console.log('query is ', queryStatement);

            return runQuery(queryStatement).then(result => {
                let serializedData = serializer.Neo4JtoVisFormat(JSON.stringify(result.records));
                return new Promise((resolve, reject) => {
                    resolve(serializedData);
                });
            }).catch(err => {
                console.log('An error occured while runnning the query', err);
                return new Promise((resolve, reject) => {
                    reject('API : get/data | ERROR : Error encountered while reading from database with 2 types');
                });
            });
        } else if (dataObj.length === 3) {
            dataObj.nodes.forEach(node => {
                node.value = createProperString(node.value);
            });
            let queryStatement
            if (!dataObj.relation) {
                queryStatement = `match (p:${dataObj.nodes[0].type}) <-[r]->(q:${dataObj.nodes[1].type}) <-[s]->(t:${dataObj.nodes[2].type}) 
                where p.Name IN [${dataObj.nodes[0].value}]
                and q.Name IN [${dataObj.nodes[1].value}] and t.Name IN [${dataObj.nodes[2].value}] return p,q,r,t,s`;
            } else {
                queryStatement = `match (p:${dataObj.nodes[0].type}) <-[r${dataObj.relation}]->(q:${dataObj.nodes[1].type}) <-[s${dataObj.relation}]->(t:${dataObj.nodes[2].type}) 
                where p.Name IN [${dataObj.nodes[0].value}]
                and q.Name IN [${dataObj.nodes[1].value}] and t.Name IN [${dataObj.nodes[2].value}] return p,q,r,t,s`;
            }
            console.log('query is ', queryStatement);

            return runQuery(queryStatement).then(result => {
                let serializedData = serializer.Neo4JtoVisFormat(JSON.stringify(result.records));
                return new Promise((resolve, reject) => {
                    resolve(serializedData);
                });
            }).catch(err => {
                console.log('An error occured while runnning the query', err);
                return new Promise((resolve, reject) => {
                    reject('API : get/data | ERROR : Error encountered while reading from database with 3 types');
                });
            });

        } else {
            //this will work in case user sends only relationships
            let queryStatement = '';
            if (!dataObj.relation) {
                queryStatement = `match (p) <-[r]->(q) return p,q,r`;
            } else {
                queryStatement = `match (p) <-[r${dataObj.relation}]->(q) return p,q,r`;
            }
            console.log('query for 0 node type is ', queryStatement);

            return runQuery(queryStatement).then(result => {
                let serializedData = serializer.Neo4JtoVisFormat(JSON.stringify(result.records));
                return new Promise((resolve, reject) => {
                    resolve(serializedData);
                });
            }).catch(err => {
                console.log('An error occured while runnning the query', err);
                return new Promise((resolve, reject) => {
                    reject('API : get/data | ERROR : Error encountered while reading from database with 0 types');
                });
            });

        }



    } else {

    }
}

// to get properties of node from database
var getGraphLabelData = (query) => {
    let queryStatement = '';

    queryStatement = `Match(n) where n.deleted = "false" RETURN n.Name,n.Connection,n.Status,n.Represent,n.Url,n.\`Understanding of SP Thinking\`,labels(n) ORDER BY labels(n)`;

    console.log('query for label is ', queryStatement);

    return runQuery(queryStatement).then(result => {
        let serializedData = labelSerializer.Neo4JtoJsonFormat(JSON.stringify(result.records));
        return new Promise((resolve, reject) => {
            resolve(serializedData);
        });
    }).catch(err => {
        console.log('An error occured while runnning the query', err);
        return new Promise((resolve, reject) => {
            reject('API : get/data | ERROR : Error encountered while reading labels from database');
        });
    });

}

var getGraphLabels = () => {
        let query = 'call db.labels()'
        return runQuery(query)
            .then(result => {
                if (result.records.length > 0) {
                    let finalLabels = {
                        labels: []
                    };
                    result.records.forEach(labelRecord => {
                        console.log(labelRecord._fields[0]);
                        finalLabels.labels.push(labelRecord._fields[0]);
                    });
                    return new Promise((resolve, reject) => {
                        resolve(finalLabels);
                    });
                }
            })
            .catch(err => {
                console.log('API : /graph/labels | Error occured while retreiving labels from database');
                console.log(err);
                return new Promise((resolve, reject) => {
                    reject('Server error while retrieving labels from the database');
                });
            });
    }
    // give initial graph with provided limit
function limitBasedInitGraphShow(limitObj) {
    // check for limit empty or undefined
    limitObj.limit = getLimit(limitObj.limit);
    let queryStatement = '';

    queryStatement = `match (p) -[r]-> (q) return p,q,r limit ${limitObj.limit}`;

    console.log('query created by graphDataV2 is ', queryStatement);
    return runQuery(queryStatement).then(result => {
        let serializedData = serializer.Neo4JtoVisFormat(JSON.stringify(result.records));
        return new Promise((resolve, reject) => {
            resolve(serializedData);
        });
    }).catch(err => {
        console.log('An error occured while runnning the query', err);
        return new Promise((resolve, reject) => {
            reject('API : get/data | ERROR : Error encountered while reading from database');
        });
    });
}

function addProperties(properties) {
    let queries = []
    Object.keys(properties).forEach(key => {
        queries.push(`\`${key}\`:"${properties[key]}"`);
    });
    if (queries.length) {
        return '{' + queries.join(',') + '}';
    } else {
        // empty properties , no need to add anything to it
        return '';
    }
}

function createNewNodeQuery(data) {
    let query = 'merge ';
    let subQuery = '';

    // first add the type to  the new node
    subQuery = `(n:\`${data.type[0]}\` `;
    // add deleted to be false by default
    data.properties['deleted'] = false;
    subQuery += addProperties(data.properties);
    subQuery += ') return n';
    query += subQuery;
    console.log('\ncomplete query created as ', query + '\n');
    return query;

}

function createNewRelationQuery(data) {
    let source = data.from;
    let target = data.to;
    let relationType = data.type[0];
    // let subQuery = addProperties(data.properties);
    let subQuery = dataUtility.processProperties('r', data.properties);
    // `merge (source)-[r:\`${data.type[0]}\`]-(target)`
    let query = `Match (source {Name: "${source}"}),(target {Name: "${target}"})
    MERGE (source)-[r: \`${relationType}\`]->(target)
    ON CREATE SET ${subQuery}
    ON MATCH SET ${subQuery}
    RETURN source,target,r`
    console.log('\nfinal query is ', query + '\n');
    return query;
}

var createNode = (request) => {
    // the task is to create a query basis the information provided
    let data = request.body;

    if (!data.hasOwnProperty('type')) {
        console.log('API : node/create | ERROR encountered while reading data for creating a node -> type key missing');
        return Promise.reject({ error: 'Cannot create a node without a type' });
    } else {
        // a type is present, can go further
        let query = createNewNodeQuery(data);
        return runQuery(query)
            .then(response => {
                let serializedData = serializer.Neo4JtoVisFormat(JSON.stringify(response.records));
                return Promise.resolve(serializedData);
            })
            .catch(err => {
                console.log('\nAn error occured while runnning the query for create node', err);
                return Promise.reject('API : node/create | ERROR : Error encountered while reading from database');
            });
    }
};

var updateNode = (request) => {
    // the task is to create a query basis the information provided
    let data = request.body;

    if (!data.hasOwnProperty('type')) {
        console.log('API : node/update | ERROR encountered while reading data for updating a node -> type key missing');
        return Promise.reject({ error: 'Cannot update a node without a type' });
    } else {
        let query = dataUtility.createUpdateNodeQuery(data);
        // run the query
        return runQuery(query)
            .then(response => {
                let serializedData = serializer.Neo4JtoVisFormat(JSON.stringify(response.records));
                return Promise.resolve(serializedData);
            })
            .catch(err => {
                console.log('\nAn error occured while runnning the query to update a node', err);
                return Promise.reject('API : node/update | ERROR : Error encountered while reading from database');
            });
    }
}

var createRelation = (request) => {
    // the task is to create a query basis the information provided
    let data = request.body;

    if (!data.hasOwnProperty('type')) {
        console.log('API : node/create | ERROR encountered while reading data for creating a relation -> type key missing');
        return Promise.reject({ error: messages.error.server.m001 });
    } else {
        if (!data.hasOwnProperty('from') || !data.hasOwnProperty('to')) {
            console.log('API : node/create | ERROR encountered while reading data for creating a relation -> either of "to"  or "from" key missing');
            return Promise.reject({ error: 'Cannot create a relation without a source or target node' });
        } else {
            // data has all three, now proceed
            // a type is present, can go further
            // first add default deleted key to false
            data.properties['deleted'] = false;
            let query = createNewRelationQuery(data);
            return runQuery(query).then(response => {
                    let serializedData = serializer.Neo4JtoVisFormat(JSON.stringify(response.records));
                    return Promise.resolve(serializedData);
                })
                .catch(err => {
                    console.log('\nAn error occured while runnning the query for create node', err);
                    return Promise.reject('API : node/create | ERROR : Error encountered while reading from database');
                });
        }
    }
}

var getRelations = () => {
    let query = `match ()-[r]-() with type(r) as relation_types,keys(r) 
      as relation_properties return distinct relation_types, relation_properties`;
    return runQuery(query).then(response => {
        // convert into neovis format and return
        let serializedData = serializer.processRelations(JSON.stringify(response.records));
        return Promise.resolve(serializedData);
    }).catch(err => {
        console.log('\nAn error occured while runnning the query for get relations', err);
        return Promise.reject('API : graph/relations | ERROR : Error encountered while reading from database');
    });
}

var updateRelationship = (request) => {
    // the task is to create a query basis the information provided
    let data = request.body;

    if (!data.hasOwnProperty('type') || !data.hasOwnProperty('id')) {
        console.log('API : relation/update | ERROR encountered while reading data for updating a relation -> type key or id missing');
        return Promise.reject({ error: messages.error.server.m002 });
    } else {
        // data has all three, now proceed
        // a type is present, can go further
        let query = dataUtility.createUpdateRelationQuery(data);
        return runQuery(query).then(response => {
                let serializedData = serializer.Neo4JtoVisFormat(JSON.stringify(response.records));
                return Promise.resolve(serializedData);
            })
            .catch(err => {
                console.log('\nAn error occured while runnning the query for create node', err);
                return Promise.reject(messages.error.API.relation.update.a001);
            });
        /* if (!data.hasOwnProperty('from') || !data.hasOwnProperty('to')) {
           console.log('API : relation/update | ERROR encountered while reading data for updating a relation -> either of "to"  or "from" key missing');
           return Promise.reject({error : messages.error.server.m003});
        } else {
            // data has all three, now proceed
            // a type is present, can go further
       let query = dataUtility.createUpdateRelationQuery(data);
       return runQuery(query).then(response => {
           let serializedData = serializer.Neo4JtoVisFormat(JSON.stringify(response.records));
           return Promise.resolve(serializedData);
           })
           .catch(err => {
               console.log('\nAn error occured while runnning the query for create node', err);
               return Promise.reject(messages.error.API.relation.update.a001);
           });
        } */
    }
}

// for run query provided by utility
var neo4jRunQuery = (query) => {
    return runQuery(query)
        .then(response => {
            console.log("query : ", query);
            console.log('Data recieved from database')
            let serializedData = labelSerializer.Neo4JtoJsonFormat(JSON.stringify(response.records));
            return Promise.resolve(serializedData);
        })
        .catch(err => {
            console.log('an error occured while retrieving metadata for nodes', err);
            neo4Jdriver.close();
        });
}

module.exports = {
    initiate,
    getData,
    searchQuery,
    getMetaData,
    getGraphData,
    getGraphDataV2,
    getDataV2,
    getGraphLabelData,
    getGraphLabels,
    createNode,
    updateNode,
    getRelations,
    createRelation,
    updateRelationship,
    neo4jRunQuery
}