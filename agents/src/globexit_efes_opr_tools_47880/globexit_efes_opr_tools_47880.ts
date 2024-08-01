const IS_DEBUG: boolean = Param.GetOptProperty('IS_DEBUG')


const logConfig = {
    code: "globex_log",
	type: "AGENT",
	agentId: "7397723664548185706"
}


interface iCategory {
    id: string,
    name: string,
}


const collsCategorys: iCategory[] = categorys.GetOptProperty('category')
const wcCategory = ArrayOptFind(collsCategorys, "This.name == 'WC – White collar'")
const executivesCategory = ArrayOptFind(collsCategorys, "This.name == 'Executives'")


function getGroupId(): number {
    try {
        const oGroup = ArrayOptFirstElem<{id: number}>(tools.xquery(`sql: 
            SELECT id
            FROM dbo.groups
            WHERE name = 'Функциональные руководители для OPR Tool'`))
        if (oGroup == undefined) {
            throw new Error('Группы с именем: "Функциональные руководители для OPR Tool" не существует')
        }
        return oGroup.id
    } catch (e) {
        throw Error("getGroupId -> " + e.message)
    }
}


const grId = getGroupId()


function getGroupColls(): {coll_id: number}[] {
    try {
        return ArraySelectAll<{coll_id: number}>(tools.xquery(`sql: 
            SELECT coll_id
            FROM dbo.groups g1
                JOIN dbo.group g2 ON g1.id = g2.id
                CROSS JOIN LATERAL unnest(xpath('/group/collaborators/collaborator/collaborator_id/text()', g2.data)::text[]) AS coll_id
            WHERE g1.id = ${grId}`
        ))
    } catch (e) {
        throw Error("getGroupColls -> " + e.message)
    }
}


function checkManager(id: number): boolean {
    try {
        if (wcCategory !== undefined && executivesCategory !== undefined) {
            const manager = ArrayOptFirstElem(tools.xquery(`sql:
                SELECT fm.id
                FROM dbo.func_managers fm
                    JOIN dbo.boss_types bt ON fm.boss_type_id = bt.id
                    JOIN dbo.collaborators c ON fm.person_id = c.id
                WHERE fm.person_id = ${id}
                    AND fm.catalog = 'collaborator'
                    AND fm.is_native = true
                    AND bt.name = 'Непосредственный руководитель'
                    AND ('${wcCategory.id}' = ANY(c.category_id) 
                    OR '${executivesCategory.id}' = ANY(c.category_id))`
            ))            
            if (manager !== undefined) {
                return true
            }
        }
        return false
    } catch (e) {
        throw Error("checkManager -> " + e.message)
    }
}


function deleteCollFromGroup(coll_id: number): void {
    try {
        const gDoc = tools.open_doc(grId)
        if (gDoc !== undefined) {
            const gColls: XmlElem<unknown> = gDoc.TopElem.OptChild('collaborators')
            if (gColls !== undefined) {
                gColls.DeleteChildren(`This.collaborator_id == ${coll_id}`)
                gDoc.Save()
            }
        }
    } catch (e) {
        throw Error("deleteCollFromGroup -> " + e.message)
    }
}


function checkCollsInGroup(): void {
    try {
        const arrColls = getGroupColls()
        if (ArrayCount(arrColls) !== 0) {
            let i = 0
            let isManager: boolean
            for (i; i < ArrayCount(arrColls); i++) {
                isManager = checkManager(arrColls[i].coll_id)
                if (!isManager) {
                    deleteCollFromGroup(arrColls[i].coll_id)
                }
            }
        }
    } catch (e) {
        throw Error("checkCollsInGroup -> " + e.message)
    }
}


function pushCollToGroup(coll_id: number): void {
    try {
        const gDoc = tools.open_doc(grId)
        if (gDoc !== undefined) {
            const gColls: XmlElem<unknown> = gDoc.TopElem.OptChild('collaborators')
            if (gColls !== undefined) {
                const newMember = gColls.AddChild()
                newMember.Child('collaborator_id').Value = coll_id
                gDoc.Save()
            }
        }
    } catch (e) {
        throw Error("pushCollToGroup -> " + e.message)
    }
}


function checkCollsInManagers() {
    try {
        const arrManagers = ArraySelectAll<{id: number}>(tools.xquery(`sql:
            SELECT c.id
            FROM dbo.func_managers fm
                JOIN dbo.boss_types bt ON fm.boss_type_id = bt.id
                JOIN dbo.collaborators c ON fm.person_id = c.id
            WHERE fm.catalog = 'collaborator'
                AND fm.is_native = true
                AND bt.name = 'Непосредственный руководитель'
                AND ('${wcCategory.id}' = ANY(c.category_id) 
                OR '${executivesCategory.id}' = ANY(c.category_id))`
        ))
        if (ArrayCount(arrManagers) !== 0) {
            let i = 0
            const arrGroupColls = getGroupColls()
            for (i; i < ArrayCount(arrManagers); i++) {
                if (ArrayOptFind(arrGroupColls, `This.coll_id == ${arrManagers[i].id}`) == undefined) {
                    pushCollToGroup(arrManagers[i].id)
                }
            }
        }
    } catch (e) {
        throw Error("checkCollsInManagers -> " + e.message)
    }
}


function Main() {
    try {
        checkCollsInGroup()
        checkCollsInManagers()
    } catch (e) {
        throw Error("Main -> " + e.message)
    }
}


function log(message: string, type?: string) {
	type = IsEmptyValue(type) ? "INFO" : StrUpperCase(type);

	if (ObjectType(message) === "JsObject" || ObjectType(message) === "JsArray" || ObjectType(message) === "XmLdsSeq") {
		message = tools.object_to_text(message, "json")
	}

	const log = `[${type}][${logConfig.type}][${logConfig.agentId}]: ${message}`;

	if (LdsIsServer) {
		LogEvent(logConfig.code, log);
	} else if (IS_DEBUG) {
		alert(log)
	}
}


log("---START. Агент по заполнению группы «Функциональные руководители».---", "info")


try {
    Main();
} catch(e) {
    log(e.message, "error")
} 


log("---END. Агент по заполнению группы «Функциональные руководители».---", "info")