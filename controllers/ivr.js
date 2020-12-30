const twilio 	= require('twilio')

const taskrouterHelper = require('./helpers/taskrouter-helper.js')

module.exports.welcome = function (req, res) {
	const twiml =  new twilio.twiml.VoiceResponse()

	let keywords = []

	/* add the team names as hints to the automatic speech recognition  */
	for (let i = 0; i < req.configuration.ivr.options.length; i++) {
		keywords.push(req.configuration.ivr.options[i].friendlyName)
	}

	const gather = twiml.gather({
		input: 'dtmf speech',
		action: 'select-team',
		method: 'GET',
		numDigits: 1,
		timeout: 4,
		language: 'fr-FR',
		hints: keywords.join()
	})

	gather.say({
		voice: 'woman',
		language: 'fr-FR'
	},req.configuration.ivr.text)

	twiml.say({
		voice: 'woman',
		language: 'fr-FR'
	},"Vous n'avez rien dit et n'avez pas appuyé sur une touche.")
	twiml.pause({length: 2})
	twiml.redirect({method: 'GET'}, 'welcome')

	res.send(twiml.toString())
}

var analyzeKeypadInput = function (digits, options) {

	for (let i = 0; i < options.length; i++) {
		if (parseInt(digits) === options[i].digit) {
			return options[i]
		}
	}

	return null
}

var analyzeSpeechInput = function (text, options) {

	for (let i = 0; i < options.length; i++) {
		if (text.toLowerCase().includes(options[i].friendlyName.toLowerCase())) {
			return options[i]
		}
	}

	return null
}

module.exports.selectTeam = function (req, res) {
	let team = null

	/* check if we got a dtmf input or a speech-to-text */
	if (req.query.SpeechResult) {
		console.log('SpeechResult: ' + req.query.SpeechResult)
		team = analyzeSpeechInput(req.query.SpeechResult, req.configuration.ivr.options)
	}

	if (req.query.Digits) {
		team = analyzeKeypadInput(req.query.Digits, req.configuration.ivr.options)
	}

	const twiml =  new twilio.twiml.VoiceResponse()

	/* the caller pressed a key that does not match any team */
	if (team === null) {
		// redirect the call to the previous twiml
		twiml.say({
			voice: 'woman',
			language: 'fr-FR'
		},"Votre choix n'est pas valide, merci d'essayer à nouveau")
		twiml.pause({length: 2})
		twiml.redirect({ method: 'GET' }, 'welcome')
	} else {

		const gather = twiml.gather({
			action: 'create-task?teamId=' + team.id + '&teamFriendlyName=' + encodeURIComponent(team.friendlyName),
			method: 'GET',
			numDigits: 1,
			timeout: 5
		})

		gather.say({
			voice: 'woman',
			language: 'fr-FR'
		},'Appuyez sur une touche si vous souhaitez être rappelé par nos conseillers ' + team.friendlyName + ', ou restez en ligne')

		/* create task attributes */
		const attributes = {
			text: "Le Client a choisi l'option " + team.friendlyName + "'",
			channel: 'phone',
			phone: req.query.From,
			name: req.query.From,
			title: 'Appel Entrant',
			team: team.id
		}

		twiml.enqueue({
			workflowSid: req.configuration.twilio.workflowSid,
		}).task({priority: 1, timeout: 3600}, JSON.stringify(attributes))

	}

	res.send(twiml.toString())
}

module.exports.createTask = async (req, res) => {
	/* create task attributes */
	const attributes = {
		title: 'Callback request',
		text: 'Caller answered IVR with option "' + req.query.teamFriendlyName + '"',
		channel: 'callback',
		name: req.query.From,	
		team: req.query.teamId,
		phone: req.query.From
	}

	const twiml =  new twilio.twiml.VoiceResponse()

	try {
    await taskrouterHelper.createTask(attributes);

    twiml.say('Thanks for your callback request, an agent will call you back soon.')
		twiml.hangup()

    res.status(200).send(twiml.toString());
  } catch (error) {
		
		twiml.say('An application error occured, the demo ends now')
		res.status(200).send(twiml.toString());
  }

}
