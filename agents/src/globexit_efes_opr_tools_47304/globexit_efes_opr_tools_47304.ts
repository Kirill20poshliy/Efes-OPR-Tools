const IS_DEBUG: boolean = Param.GetOptProperty('IS_DEBUG')

const toNewColl: boolean = Param.GetOptProperty('toNewColl', false)
const daysA: number = Param.GetOptProperty('daysA', 0)
const notificationTypeA: number = Param.GetOptProperty('notificationTypeA')

const remainderToNewColl: boolean = Param.GetOptProperty('remainderToNewColl', false)
const daysB: number = Param.GetOptProperty('daysB', 0)
const notificationTypeB: number = Param.GetOptProperty('notificationTypeB')

const afterDecreeOrSuspense: boolean = Param.GetOptProperty('afterDecreeOrSuspense', false)
const daysC: number = Param.GetOptProperty('daysC', 0)
const notificationTypeC: number = Param.GetOptProperty('notificationTypeC')

const remainderAfterDecreeOrSuspense: boolean = Param.GetOptProperty('remainderAfterDecreeOrSuspense', false)
const daysD: number = Param.GetOptProperty('daysD', 0)
const notificationTypeD: number = Param.GetOptProperty('notificationTypeD')

const everyYear: boolean = Param.GetOptProperty('everyYear', false)
const dayInYear: number = Param.GetOptProperty('dayInYear')
const notificationTypeE: number = Param.GetOptProperty('notificationTypeE')

const remainderEveryYear: boolean = Param.GetOptProperty('remainderEveryYear', false)
const daysF: number = Param.GetOptProperty('daysF', 0)
const notificationTypeF: number = Param.GetOptProperty('notificationTypeF')


const logConfig = {
    code: "globex_log",
	type: "AGENT",
	agentId: "7396998261588180318"
}


EnableLog(logConfig.code, IS_DEBUG)


interface iColl {
    id: number
}


interface iResume {
    name: string,
    value: string
}


interface iState {
    id: string,
    name: string
}


const states = lists.person_states
const stateDecree = ArrayOptFind<iState>(states, "This.name == 'Декрет'")
const stateSuspense = ArrayOptFind<iState>(states, "This.name == 'Приостановка ТД'") 


function getDate(days: number): Date {
    try {
        return DateNewTime(DateOffset(Date(), -86400*OptInt(days)), 0, 0, 0)
    } catch (e) {
        throw new Error('getDate -> ' + e.message)
    }
}


function getCollsByHireDate(date: string): iColl[] {
    try {
        return ArraySelectAll<iColl>(tools.xquery(`sql:
            SELECT id
            FROM dbo.collaborators
            WHERE hire_date = '${date}' AND is_dismiss = false`
        ))
    } catch (e) {
        throw new Error('getCollsByHireDate -> ' + e.message)
    }
}


function getCollsByStateDate(date: string): iColl[] {
    try {
        if (stateDecree == undefined || stateSuspense == undefined) {
            return []
        }
        return ArraySelectAll<iColl>(tools.xquery(`sql:
            SELECT c1.id 
            FROM dbo.collaborators c1
            JOIN dbo.collaborator c2 ON c1.id = c2.id
            CROSS JOIN LATERAL unnest(
            xpath(
                '/collaborator/history_states/history_state[(state_id="${stateDecree.id}" or state_id="${stateSuspense.id}") and finish_date="${date}"]',
                c2.data
            ))
            WHERE c1.is_dismiss = false`
        ))
    } catch (e) {
        throw new Error('getCollsByStateDate -> ' + e.message)
    }
}


function getCollsWhithoutActiveState(): iColl[] {
    try {
        return ArraySelectAll(tools.xquery(`sql: 
            SELECT id 
            FROM dbo.collaborators
            WHERE is_dismiss = false AND current_state NOT IN ('Декрет', 'Приостановка ТД') OR current_state IS NULL`
        ))
    } catch (e) {
        throw new Error('getCollsWhithoutActiveState -> ' + e.message)
    }
}


function getResumeData(collaborator_id: number): iResume[] {
    try {
        let result = ArrayOptFirstElem<{custom_elems: string}>(tools.xquery(`sql: \
            SELECT custom_elems FROM dbo.resumes r1
            JOIN dbo.resume r2 ON r1.id = r2.id
            CROSS JOIN LATERAL unnest(xpath('/resume/custom_elems'::text, r2.data)) AS custom_elems
            WHERE r1.person_id = ${collaborator_id}`
        ))
        if (result !== undefined) {
            let customElems = tools.read_object<{custom_elem: iResume[] | iResume}>(result.custom_elems)
            return IsArray(customElems.custom_elem) ? customElems.custom_elem : [customElems.custom_elem]
        }
        return []
    } catch (e) {
        throw new Error('getResumeData -> ' + e.message)
    }
}


function checkResumeData(resumeData: iResume[]): boolean {
    try {
        if (ArrayCount(resumeData) === 0) {
            return false
        }
        let achievements = ArrayOptFind(resumeData, "This.name == 'achievements'")
        let mobility = ArrayOptFind(resumeData, "This.name == 'mobility'")
        let comment_short_term_career_interests = ArrayOptFind(resumeData, "This.name == 'comment_short_term_career_interests'")
        if (achievements == undefined || mobility == undefined || comment_short_term_career_interests == undefined) {
               return false 
        }
        return true
    } catch (e) {
        throw new Error('checkResumeData -> ' + e.message)
    }
}


function sendNotifications(arrColls: iColl[], notificationType: number): void {
    try {
        let i = 0
        let text: string
        if (ArrayCount(arrColls) !== 0 && notificationType !== undefined) {
            for (i; i < ArrayCount(arrColls); i++) {
                text = UrlAppendPath(global_settings.settings.portal_base_url, '/_wt/efes-opr-tools-web?user_id=' + arrColls[i].id)
                tools.create_notification(notificationType, arrColls[i].id, text)
            }
        }
    } catch (e) {
        throw new Error('sendNotifications -> ' + e.message)
    }
}


function Main() {
    try {
        let arrColls: iColl[]
        let dateNow = DateNewTime(Date(), 0, 0, 0)
        let yearStart = Date(`01.01.${Year(dateNow)} 00:00`)
        
        if (toNewColl) {
            arrColls = getCollsByHireDate(StrDate(getDate(daysA)))
            sendNotifications(arrColls, notificationTypeA)
        }

        if (remainderToNewColl) {
            arrColls = getCollsByHireDate(StrDate(getDate(daysB)))
            if (ArrayCount(arrColls) !== 0) {
                let i: number = 0
                let resumeData: iResume[]
                let isFullFilled: boolean
                for (i; i < ArrayCount(arrColls); i++) {
                    resumeData = getResumeData(arrColls[i].id)
                    isFullFilled = checkResumeData(resumeData)
                    if (!isFullFilled) {
                        sendNotifications([arrColls[i]], notificationTypeB)
                    }
                }
            }
        }
        
        if (afterDecreeOrSuspense) {
            arrColls = getCollsByStateDate(StrXmlDate(getDate(daysC)))
            sendNotifications(arrColls, notificationTypeC)
        }

        if (remainderAfterDecreeOrSuspense) {
            arrColls = getCollsByStateDate(StrXmlDate(getDate(daysD)))
            sendNotifications(arrColls, notificationTypeD)
        }

        if (everyYear) {
            if (dayInYear !== undefined) {
                if (DateToRawSeconds(dateNow) === DateToRawSeconds(yearStart) + (OptInt(dayInYear) - 1) * 86400) {
                    arrColls = getCollsWhithoutActiveState()
                    sendNotifications(arrColls, notificationTypeE)
                }
            }
        }

        if (remainderEveryYear) {
            if (dayInYear !== undefined && daysF !== undefined) {
                let everyYearDate = RawSecondsToDate(DateToRawSeconds(yearStart) + (OptInt(dayInYear) - 1) * 86400)
                if (everyYearDate === getDate(daysF)) {
                    arrColls = getCollsWhithoutActiveState()
                    sendNotifications(arrColls, notificationTypeE)
                }
            }
        }

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


log("---START. Агент по информированию сотрудников о необходимости обновить Карту таланта.---", "info")


try {
    Main();
} catch(e) {
    log(e.message, "error")
} 


log("---END. Агент по информированию сотрудников о необходимости обновить Карту таланта.---", "info")
