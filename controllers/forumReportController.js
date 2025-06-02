import contactForm from "../models/contact_form";
import User from "../models/User.js";
import contactFormSchema from "../controllers/contactFormSchema.js";
import * as Filter from 'bad-words'; 


export const createContactFormEntry = async (req, res) => {
  try {
    const { error } = contactFormSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { email, description, type } = req.body;
    // Sanitize description
    const filter = new Filter.Filter();
    const cleanDescription = filter.clean(description);

    // Find user if authenticated
    let reporter = null;
    if (req.user && req.user.id) {
      const user = await User.findById(req.user.id);
      reporter = user ? user._id : null;
    }

    const newEntry = new contactForm({
      email,
      description: cleanDescription,
      type,
      reporter
    });

    await newEntry.save();
    return res.status(201).json({ message: 'Contact form entry created successfully.', entry: newEntry });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create contact form entry.' });
  }
};

export const getContactFormEntries = async (req, res) => {
  try {
    const entries = await contactForm.find().populate('reporter', 'username email');
    return res.status(200).json(entries);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve contact form entries.' });
  }
};

export const updateContactFormEntry = async (req, res) => {


    try {
        const { id } = req.params;
        const { status } = req.body;
    
        if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status value.' });
        }
    
        const entry = await contactForm.findByIdAndUpdate(id, { status }, { new: true });
        if (!entry) {
        return res.status(404).json({ message: 'Contact form entry not found.' });
        }

        if (status === 'closed'){

            await entry.remove();
            return res.status(200).json({ message: 'Contact form entry closed and removed successfully.' });
        }
    
        return res.status(200).json({ message: 'Contact form entry updated successfully.', entry });
    } catch (error) {
        console.error('Error updating contact form entry:', error);
        return res.status(500).json({ error: 'Failed to update contact form entry.' });
    }


};